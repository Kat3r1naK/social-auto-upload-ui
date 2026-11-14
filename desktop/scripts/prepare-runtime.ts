import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { prepareOptions } from './prepare-options'

const root = resolve(__dirname, '../../..')
const runtime = join(root, 'desktop', 'runtime')
const python = join(root, '.venv', 'Scripts', 'python.exe')
async function run(command: string, args: string[], env = process.env) {
  await new Promise<void>((done, reject) => {
    const child = spawn(command, args, { cwd: root, windowsHide: true, stdio: 'inherit', env })
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0 ? done() : reject(new Error(command + ' exited with ' + code)),
    )
  })
}
async function main() {
  if (!existsSync(python)) throw new Error('请先执行 uv sync --python 3.12 --extra desktop')
  if (!existsSync(join(root, 'utils/article_renderer/node_modules/baoyu-md')))
    throw new Error('请先执行 npm ci --prefix utils/article_renderer')
  if (!runtime.startsWith(root + '\\desktop\\') && !runtime.startsWith(root + '/desktop/'))
    throw new Error('Unexpected runtime output path')
  mkdirSync(runtime, { recursive: true })
  const env = {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: join(runtime, 'browsers'),
    PYTHONUTF8: '1',
  }
  // Desktop uploaders use full Chromium (explicit executable or chromium channel),
  // including its headless mode. Keep each driver's matching browser revision.
  await run(python, ['-m', 'patchright', 'install', '--no-shell', 'chromium'], env)
  await run(python, ['-m', 'playwright', 'install', '--no-shell', 'chromium'], env)
  await run(python, [join(root, 'desktop/python/prepare_tools.py')], env)
  const sourceHash = createHash('sha256')
    .update(readFileSync(join(root, 'desktop/python/worker.py')))
    .digest('hex')
  await run(
    python,
    [
      '-m',
      'PyInstaller',
      '--noconfirm',
      '--clean',
      '--onedir',
      '--name',
      'sau-worker',
      '--distpath',
      join(runtime, 'build-output'),
      '--workpath',
      join(runtime, 'build-cache'),
      '--specpath',
      join(runtime, 'spec'),
      '--paths',
      root,
      '--collect-submodules',
      'sau_commands',
      '--collect-submodules',
      'uploader',
      '--hidden-import',
      'uploader.tk_uploader.main_chrome',
      '--collect-all',
      'patchright',
      '--collect-all',
      'playwright',
      '--collect-all',
      'tinycss2',
      '--add-data',
      join(root, 'utils/stealth.min.js') + ';utils',
      '--add-data',
      join(root, 'utils/article_renderer') + ';utils/article_renderer',
      join(root, 'desktop/python/worker.py'),
    ],
    env,
  )
  // Copy the verified onedir output to the stable resource path used by electron-builder.
  const { cpSync } = await import('node:fs')
  cpSync(join(runtime, 'build-output', 'sau-worker'), join(runtime, 'worker'), { recursive: true })
  if (
    sourceHash !==
    createHash('sha256')
      .update(readFileSync(join(root, 'desktop/python/worker.py')))
      .digest('hex')
  )
    throw new Error('Worker source changed during packaging; rebuild the runtime.')
  await prepareOptions(root)
  writeFileSync(
    join(runtime, 'manifest.json'),
    JSON.stringify(
      {
        preparedAt: new Date().toISOString(),
        platforms: 17,
        python: '3.12',
        format: 'pyinstaller-onedir',
        sourceHash,
      },
      null,
      2,
    ),
  )
  console.log('Desktop runtime prepared at ' + runtime)
}
void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
