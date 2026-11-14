"""Best-effort desktop avatars from the authenticated account's own profile controls.

Only explicit account controls are inspected. Never fall back to feed images or
the first avatar on a page: those may belong to a different person.
"""
from __future__ import annotations

import asyncio
import base64
import io
import json
from pathlib import Path


# Xiaohongshu's current creator header was verified against a real session.
# Other adapters are conservative fallbacks; a changed/missing control yields no avatar.
PROFILE_CONTROLS = {
    "xiaohongshu": (
        "https://creator.xiaohongshu.com/creator/home",
        ".user-info img.user_avatar",
    ),
    "douyin": (
        "https://creator.douyin.com/creator-micro/home",
        '[class*="header"] [class*="avatar"] img, [class*="header"] img[class*="avatar"]',
    ),
    "kuaishou": (
        "https://cp.kuaishou.com/article/publish/video",
        'header [class*="avatar"] img, .header [class*="avatar"] img, .header img[class*="avatar"]',
    ),
    "tencent": (
        "https://channels.weixin.qq.com/platform",
        '.finder-header [class*="avatar"] img, .finder-account [class*="avatar"] img, img.finder-avatar',
    ),
    "bilibili": (
        "https://member.bilibili.com/platform/home",
        '.header-entry-mini img, .header-avatar img',
    ),
    "zhihu": (
        "https://www.zhihu.com/creator",
        "button.AppHeader-profileEntry img[alt^='点击打开'][alt$='的主页']",
    ),
    "youtube": (
        "https://studio.youtube.com/",
        'button#avatar-btn img, #avatar-button img',
    ),
    "instagram": (
        "https://www.instagram.com/",
        'a[href]:has([aria-selected] img) img',
    ),
}


def browser_state(platform: str, account_file: Path) -> dict:
    """Translate biliup cookies without changing the saved platform session."""
    state = json.loads(account_file.read_text(encoding="utf-8"))
    if platform == "bilibili" and "cookie_info" in state:
        cookies = []
        for cookie in state["cookie_info"]["cookies"]:
            cookies.append({
                "name": cookie["name"], "value": cookie["value"],
                "domain": ".bilibili.com", "path": "/",
            })
        return {"cookies": cookies, "origins": []}
    return state


async def read_profile_image(page, selector: str) -> str | None:
    # A profile control must be unique and its image fully loaded before capture.
    # Screenshots use the already authenticated, rendered image, avoiding hotlink
    # restrictions and signed CDN URLs in the frontend.
    await page.wait_for_function(
        """selector => {
            const images = [...document.querySelectorAll(selector)].filter(el =>
                el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);
            return images.length === 1 && images[0].complete && images[0].naturalWidth > 0;
        }""",
        arg=selector, timeout=8000,
    )
    image = page.locator(selector).filter(visible=True)
    if await image.count() != 1:
        return None
    raw = await image.screenshot(type="png", timeout=4000, animations="disabled")
    from PIL import Image, ImageOps
    with Image.open(io.BytesIO(raw)) as source:
        avatar = ImageOps.fit(source.convert("RGBA"), (128, 128))
        output = io.BytesIO()
        avatar.save(output, format="PNG", optimize=True)
    return base64.b64encode(output.getvalue()).decode("ascii")


async def read_account_avatar(platform: str, account_file: Path) -> str | None:
    profile = PROFILE_CONTROLS.get(platform)
    if not profile or not account_file.is_file():
        return None
    from patchright.async_api import async_playwright
    from conf import LOCAL_CHROME_PATH
    async with async_playwright() as engine:
        browser = await engine.chromium.launch(
            executable_path=LOCAL_CHROME_PATH or None, channel="chromium", headless=True, timeout=10000,
        )
        try:
            # The entire optional lookup is bounded, including network and image loading.
            async with asyncio.timeout(22):
                context = await browser.new_context(
                    storage_state=browser_state(platform, account_file),
                    viewport={"width": 1440, "height": 900}, device_scale_factor=3,
                )
                page = await context.new_page()
                await page.goto(profile[0], wait_until="domcontentloaded", timeout=12000)
                return await read_profile_image(page, profile[1])
        finally:
            await browser.close()


async def attach_account_avatar(request: dict, result: dict) -> dict:
    if result.get("ok") and request.get("action") in ("login", "check"):
        try:
            from sau_commands.arguments import resolve_account_file
            avatar = await read_account_avatar(
                request["platform"], resolve_account_file(request["platform"], request["account"]),
            )
            if avatar:
                result["avatar"] = avatar
        except Exception:
            # Optional profile metadata must never turn a successful login into a failure.
            pass
    return result
