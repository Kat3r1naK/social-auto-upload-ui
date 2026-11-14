"""Private desktop worker. Runs exactly one platform operation and writes a structured result.

The TypeScript host owns the durable queue. This process reuses upstream platform commands;
stdout is diagnostic only and is never parsed as evidence of publication.
"""
from __future__ import annotations

import argparse
import asyncio
import importlib
import json
import os
import re
import shutil
import sys
import types
from pathlib import Path

MODULES = {
    name: name.replace('-', '_') for name in (
        'douyin', 'xiaohongshu', 'kuaishou', 'tencent', 'bilibili', 'baijiahao',
        'dayu', 'alipay', 'weibo', 'hupu', 'xueqiu', 'zhihu', 'youtube',
        'facebook', 'facebook-page', 'instagram',
    )
}
LABELS = {
    'tid': 'B 站分区编号', 'thumbnail': '封面图片', 'thumbnail_landscape': '横版封面',
    'thumbnail_portrait': '竖版封面', 'short_title': '短标题', 'category': '内容分类',
    'collection': '合集名称', 'playlist': '播放列表', 'visibility': '可见范围',
    'declaration': '创作声明', 'originality': '原创类型', 'video_mark': '视频标注',
    'page': '目标公共主页名称', 'proxy': '代理地址', 'source': '内容来源',
    'source_url': '转载原文链接', 'author': '作者', 'cover': '封面图片',
    'theme': '文章主题', 'bgm': '背景音乐', 'product_link': '商品链接',
    'product_title': '商品名称',
}
COMMON = {'help', 'account', 'file', 'title', 'desc', 'tags', 'images', 'note', 'notef',
          'content_file', 'schedule', 'debug', 'headless', 'result', 'prepare_only',
          'show_options', 'upload_timeout', 'cover_indices', 'draft'}


def configure(data_directory: Path, job_directory: Path):
    root = Path(__file__).resolve().parents[2] if not getattr(sys, 'frozen', False) else Path(sys._MEIPASS)
    sys.path.insert(0, str(root))
    data_directory.mkdir(parents=True, exist_ok=True)
    for folder in ('cookies', 'logs', 'results'):
        (data_directory / folder).mkdir(exist_ok=True)
    # Every worker gets a private writable working directory, including legacy verify_code.txt.
    conf = types.ModuleType('conf')
    conf.BASE_DIR = job_directory
    conf.LOCAL_CHROME_PATH = os.environ.get('SAU_CHROME_PATH', '')
    browsers = os.environ.get('PLAYWRIGHT_BROWSERS_PATH')
    if browsers:
        import patchright
        metadata = Path(patchright.__file__).parent / 'driver/package/browsers.json'
        revision = next(item['revision'] for item in json.loads(metadata.read_text())['browsers'] if item['name'] == 'chromium')
        executable = Path(browsers) / f'chromium-{revision}' / 'chrome-win64/chrome.exe'
        if executable.exists():
            conf.LOCAL_CHROME_PATH = str(executable)
    conf.LOCAL_CHROME_HEADLESS = False
    conf.DEBUG_MODE = False
    conf.XHS_SERVER = 'http://127.0.0.1:11901'
    conf.YT_PROXY = None
    sys.modules['conf'] = conf
    import sau_commands.arguments as arguments

    def resolve_account_file(platform: str, account_name: str) -> Path:
        if not re.fullmatch(r'[a-z0-9-]+', platform) or not re.fullmatch(r'[a-zA-Z0-9-]+', account_name):
            raise ValueError('Invalid private account key')
        return data_directory / 'cookies' / f'{platform}_{account_name}.json'

    arguments.resolve_account_file = resolve_account_file
    import utils.log  # noqa: F401
    from loguru import logger
    logger.remove()
    logger.add(sys.stderr, level='INFO', backtrace=False, diagnose=False, colorize=False)


def parser_for(platform: str):
    module = importlib.import_module('sau_commands.' + MODULES[platform])
    parser = argparse.ArgumentParser(prog='sau-desktop')
    subparsers = parser.add_subparsers(dest='platform', required=True)
    module.register(subparsers)
    platform_parser = subparsers.choices[platform]
    actions = next(action for action in platform_parser._actions if isinstance(action, argparse._SubParsersAction))
    return module, parser, actions.choices


def options_for(parser: argparse.ArgumentParser) -> list[dict]:
    result = []
    for action in parser._actions:
        if not action.option_strings or action.dest in COMMON:
            continue
        # Lists need a dedicated editor; currently only optional cover-indices use this.
        if action.nargs in ('+', '*'):
            continue
        field_type = ('boolean' if isinstance(action, (argparse._StoreTrueAction, argparse._StoreFalseAction))
                      else 'select' if action.choices else 'number' if action.type is int
                      else 'file' if action.type and getattr(action.type, '__name__', '') == 'existing_file_path'
                      else 'text')
        item = {'key': action.dest, 'label': LABELS.get(action.dest, action.dest.replace('_', ' ')),
                'type': field_type, 'required': action.required, 'hint': action.help or ''}
        if action.choices:
            item['choices'] = [str(value) for value in action.choices]
        if isinstance(action.default, (str, int, bool)):
            item['default'] = action.default
        result.append(item)
    return result


def rebase_images(content: str, source: str | None) -> str:
    if not source:
        return content
    base = Path(source).resolve().parent

    def absolute(value: str):
        if re.match(r'^(https?:|data:|file:|#)', value, re.I) or Path(value).is_absolute():
            return value
        return (base / value).resolve().as_posix()

    content = re.sub(r'(!\[[^\]]*\]\()([^\s)]+)(\))', lambda m: m[1] + absolute(m[2]) + m[3], content)
    return re.sub(r'(<img\b[^>]*\bsrc=[\"\x27])([^\"\x27]+)([\"\x27])',
                  lambda m: m[1] + absolute(m[2]) + m[3], content, flags=re.I)


async def tiktok(request: dict):
    if request['action'] == 'schema':
        from uploader.tk_uploader.main_chrome import TiktokVideo  # Verify this legacy module is in the bundle.
        return {'ok': True, 'message': '', 'options': []}
    from sau_commands.arguments import resolve_account_file
    from uploader.tk_uploader.main_chrome import TiktokVideo, cookie_auth
    account_file = resolve_account_file('tiktok', request.get('account', ''))
    action = request['action']
    if action == 'schema':
        return {'ok': True, 'message': '', 'options': []}
    if action == 'login':
        # Replace the legacy page.pause()/inspector requirement with a bounded visible login.
        from playwright.async_api import async_playwright
        async with async_playwright() as engine:
            browser = await engine.chromium.launch(headless=False)
            try:
                context = await browser.new_context()
                page = await context.new_page()
                await page.goto('https://www.tiktok.com/login?lang=en')
                for _ in range(120):
                    await asyncio.sleep(5)
                    cookies = await context.cookies()
                    if any(cookie['name'] in ('sessionid', 'sessionid_ss') and cookie['value'] for cookie in cookies):
                        await context.storage_state(path=account_file)
                        return {'ok': True, 'message': 'TikTok 会话已保存在本机，请执行账号检查。'}
                raise RuntimeError('登录等待超时，请重试。')
            finally:
                await browser.close()
    if not account_file.exists() or not await cookie_auth(str(account_file)):
        return {'ok': False, 'message': 'TikTok 会话缺失或已失效。'}
    if action == 'check':
        return {'ok': True, 'message': '账号检查通过。'}
    task = request['task']
    caption = '\n'.join(value for value in (task['title'], task.get('description', '')) if value)
    app = TiktokVideo(caption, task['assets'][0]['localPath'], task['tags'], 0, str(account_file))
    app.local_executable_path = None  # Use the revision bundled for Playwright, not Patchright's browser.
    await app.main()
    return {'ok': True, 'message': '上传核心执行结束，结果需要核验。'}


async def execute_operation(request: dict):
    platform, action = request['platform'], request['action']
    if platform == 'tiktok':
        return await tiktok(request)
    if platform not in MODULES or action not in ('schema', 'login', 'check', 'publish'):
        raise ValueError('Unsupported platform operation')
    module, parser, actions = parser_for(platform)
    if platform == 'bilibili':
        from uploader.bilibili_uploader import runtime
        tools = os.environ.get('SAU_DESKTOP_TOOLS')
        runtime.get_biliup_runtime_root = lambda: Path(tools) / 'biliup' if tools else Path(request['dataDirectory']) / 'tools/biliup'
    if action == 'schema':
        target = 'upload-' + {'video': 'video', 'note': 'note', 'article': 'article'}[request['kind']]
        if target not in actions:
            raise ValueError('该平台没有此内容类型的上传入口。')
        options = options_for(actions[target])
        if platform == 'facebook-page':
            for option in options:
                if option['key'] == 'page':
                    option['required'] = True
        return {'ok': True, 'message': '', 'options': options}
    argv = [platform, action, '--account', request['account']]
    if action == 'publish':
        task = request['task']
        target = 'upload-' + task['kind']
        action_parser = actions[target]
        argv[1] = target
        values = {'title': task['title'], 'desc': task['description'], 'tags': ','.join(task['tags']),
                  'note': task['description'], **task.get('platformOptions', {})}
        if task['kind'] == 'video':
            values['file'] = task['assets'][0]['localPath']
        elif task['kind'] == 'note':
            values['images'] = [asset['localPath'] for asset in task['assets']]
        else:
            body = rebase_images(task['body'], task.get('articleBasePath'))
            suffix = '.html' if re.match(r'\s*<(?:!doctype|html|p\b|div\b|h[1-6]\b)', body, re.I) else '.md'
            content = Path(request['jobDirectory']) / ('content' + suffix)
            content.write_text(body, encoding='utf-8')
            values['content_file'] = str(content)
        for field in action_parser._actions:
            if field.dest not in values or values[field.dest] is None:
                continue
            value = values[field.dest]
            flag = field.option_strings[0]
            if isinstance(field, argparse._StoreTrueAction):
                if value: argv.append(flag)
            elif isinstance(field, argparse._StoreFalseAction):
                if not value: argv.append(flag)
            elif isinstance(value, list):
                argv.extend([flag, *map(str, value)])
            else:
                argv.extend([flag, str(value)])
    else:
        action_parser = actions[action]
    if '--headed' in action_parser._option_string_actions:
        argv.append('--headed')
    if platform == 'bilibili' and action == 'login':
        from sau_commands.arguments import resolve_account_file
        from uploader.bilibili_uploader import runtime
        data = Path(request['dataDirectory'])
        binary = runtime.ensure_biliup_binary(force_check=False)
        account_file = resolve_account_file(platform, request['account'])
        qr_directory = data / 'login_qr'
        qr_directory.mkdir(exist_ok=True)
        qr = qr_directory / (request['account'] + '.png')
        qr.unlink(missing_ok=True)
        process = await asyncio.create_subprocess_exec(str(binary), '-u', str(account_file), 'login',
            cwd=request['jobDirectory'], stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
        output = asyncio.create_task(process.communicate())
        try:
            async with asyncio.timeout(600):
                while not output.done():
                    generated = Path(request['jobDirectory']) / 'qrcode.png'
                    if generated.exists():
                        shutil.copyfile(generated, qr)
                    await asyncio.sleep(1)
                await output
            return {'ok': process.returncode == 0 and account_file.exists(), 'message': 'B 站登录流程已结束，请检查账号状态。'}
        finally:
            if process.returncode is None:
                process.kill()
                await process.wait()
            qr.unlink(missing_ok=True)
    # CLI scheduling is intentionally omitted: desktop later means local execution time.
    args = parser.parse_args(argv)
    code = await asyncio.wait_for(module.run(args), timeout=600 if action == 'login' else 7200)
    return {'ok': code == 0, 'message': '账号操作完成。' if code == 0 else '账号检查或平台操作未通过。'}


async def execute(request: dict):
    from utils.account_avatar import attach_account_avatar
    return await attach_account_avatar(request, await execute_operation(request))


async def check_runtime():
    for driver in ('patchright', 'playwright'):
        api = importlib.import_module(driver + '.async_api')
        async with api.async_playwright() as engine:
            browser = await engine.chromium.launch(channel='chromium', headless=True)
            try:
                page = await browser.new_page()
                await page.set_content('<main>SAU offline runtime check</main>')
                assert await page.locator('main').inner_text() == 'SAU offline runtime check'
            finally:
                await browser.close()
    return {'ok': True, 'message': 'Both browser drivers verified offline.'}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--request', required=True, type=Path)
    parser.add_argument('--result', required=True, type=Path)
    args = parser.parse_args()
    try:
        request = json.loads(args.request.read_text(encoding='utf-8'))
        configure(Path(request['dataDirectory']), Path(request['jobDirectory']))
        result = asyncio.run(check_runtime() if request.get('action') == '_check-runtime' else execute(request))
    except BaseException as exc:
        result = {'ok': False, 'message': f'{type(exc).__name__}: {exc}'}
    temporary = args.result.with_suffix('.tmp')
    temporary.write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')
    temporary.replace(args.result)


if __name__ == '__main__':
    main()
