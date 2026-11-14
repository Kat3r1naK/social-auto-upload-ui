import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import assert from 'node:assert/strict'
import { resolveRuntime } from '../worker'
import { platforms } from '../../shared/platforms'

const root = resolve(__dirname, '../../..')
const bundle = resolve(root, process.argv[2] || 'release/win-unpacked')
const executable = join(bundle, 'SAU Studio.exe')
assert.ok(existsSync(executable), 'Build the Windows application first')
assert.ok(
  !readdirSync(join(bundle, 'resources/browsers')).some((name) =>
    name.startsWith('chromium_headless_shell-'),
  ),
  'Unused headless shells must not be shipped',
)
const environment = { ...process.env, PATH: '', ELECTRON_RUN_AS_NODE: '1' }
const runtime = resolveRuntime(root, join(bundle, 'resources'))
for (const platform of platforms)
  for (const kind of platform.kinds) {
    assert.ok(
      runtime.schemas?.[platform.id + ':' + kind],
      'Prepared platform schema missing or stale: ' + platform.id + '/' + kind,
    )
  }
assert.deepEqual(readdirSync(join(bundle, 'locales')).sort(), ['en-US.pak', 'zh-CN.pak'])
const sqlite = spawnSync(
  executable,
  [
    '-e',
    'console.log(new (require("node:sqlite").DatabaseSync)(":memory:").prepare("SELECT 1 AS value").get().value)',
  ],
  { env: environment, windowsHide: true, encoding: 'utf8', timeout: 15000 },
)
assert.equal(sqlite.status, 0, sqlite.stderr)
assert.equal(sqlite.stdout.trim(), '1')
const renderer = join(bundle, 'resources/worker/_internal/utils/article_renderer/render.mjs')
const article = spawnSync(executable, [renderer], {
  env: environment,
  windowsHide: true,
  encoding: 'utf8',
  timeout: 30000,
  input: JSON.stringify({
    content: '# 桌面运行时\n\n正文 **加粗**。',
    theme: 'plain',
  }),
})
assert.equal(article.status, 0, article.stderr)
const result = JSON.parse(article.stdout) as { html: string }
assert.ok(result.html.includes('<strong>加粗</strong>'))
for (const driver of ['patchright', 'playwright']) {
  assert.equal(
    existsSync(join(bundle, 'resources/worker/_internal', driver, 'driver/node.exe')),
    false,
    'Driver must reuse Electron Node',
  )
  const manifest = JSON.parse(
    readFileSync(
      join(bundle, 'resources/worker/_internal', driver, 'driver/package/browsers.json'),
      'utf8',
    ),
  ) as { browsers: { name: string; revision: string }[] }
  const revision = manifest.browsers.find((item) => item.name === 'chromium')!.revision
  assert.ok(
    existsSync(
      join(bundle, 'resources/browsers', 'chromium-' + revision, 'chrome-win64/chrome.exe'),
    ),
    driver + ' browser missing',
  )
}
const checkDirectory = mkdtempSync(join(tmpdir(), 'sau-bundle-check-'))
try {
  const request = join(checkDirectory, 'request.json'),
    output = join(checkDirectory, 'result.json')
  writeFileSync(
    request,
    JSON.stringify({
      action: '_check-runtime',
      dataDirectory: checkDirectory,
      jobDirectory: checkDirectory,
    }),
  )
  const check = spawnSync(
    join(bundle, 'resources/worker/sau-worker.exe'),
    ['--request', request, '--result', output],
    {
      env: {
        ...environment,
        PLAYWRIGHT_NODEJS_PATH: executable,
        PLAYWRIGHT_BROWSERS_PATH: join(bundle, 'resources/browsers'),
      },
      windowsHide: true,
      encoding: 'utf8',
      timeout: 60000,
    },
  )
  assert.equal(check.status, 0, check.stderr)
  assert.equal(JSON.parse(readFileSync(output, 'utf8')).ok, true, readFileSync(output, 'utf8'))
} finally {
  assert.ok(resolve(checkDirectory).startsWith(resolve(tmpdir()) + sep + 'sau-bundle-check-'))
  rmSync(checkDirectory, { recursive: true, force: true })
}
const biliup = spawnSync(
  join(bundle, 'resources/tools/biliup/windows-x86_64/biliup.exe'),
  ['--version'],
  { env: environment, windowsHide: true, encoding: 'utf8', timeout: 15000 },
)
assert.equal(biliup.status, 0, biliup.stderr)
console.log(
  'Packaged SQLite, Markdown rendering, both browser revisions and ' +
    biliup.stdout.trim() +
    ' verified with PATH empty.',
)
