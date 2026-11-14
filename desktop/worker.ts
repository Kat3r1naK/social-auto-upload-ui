import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { createInterface } from 'node:readline'
import { rmdir, unlink } from 'node:fs/promises'
import type { PlatformOption } from '../shared/desktop'

export interface WorkerResult {
  ok: boolean
  message: string
  options?: PlatformOption[]
  /** Base64 PNG, normalized to at most 128 x 128 pixels by the private worker. */
  avatar?: string
}
export interface WorkerRequest {
  platform: string
  action: string
  account?: string
  task?: unknown
  kind?: string
}
export interface WorkerHandle {
  result: Promise<WorkerResult>
  stop(): Promise<void>
  verification?(code: string): void
}
export interface WorkerRuntime {
  ready: boolean
  message: string
  command: string
  prefix: string[]
  browsers?: string
  node?: string
  tools?: string
  schemas?: Record<string, PlatformOption[]>
}
const schemaManifest = z.object({
  workerHash: z.string(),
  options: z.record(
    z.string(),
    z.array(
      z.object({
        key: z.string(),
        label: z.string(),
        type: z.enum(['text', 'number', 'boolean', 'select', 'file']),
        required: z.boolean(),
        choices: z.array(z.string()).optional(),
        default: z.union([z.string(), z.number(), z.boolean()]).optional(),
        hint: z.string().optional(),
      }),
    ),
  ),
})
function readSchemas(worker: string): Record<string, PlatformOption[]> | undefined {
  const path = join(dirname(worker), 'platform-options.json')
  if (!existsSync(path)) return undefined
  try {
    const manifest = schemaManifest.parse(JSON.parse(readFileSync(path, 'utf8')))
    if (manifest.workerHash === createHash('sha256').update(readFileSync(worker)).digest('hex'))
      return manifest.options
  } catch {
    /* Invalid or stale metadata falls back to an isolated worker. */
  }
  return undefined
}
export function resolveRuntime(root: string, resources?: string): WorkerRuntime {
  const runtimeRoot = resources || join(root, 'desktop', 'runtime')
  const bundled = join(runtimeRoot, 'worker', 'sau-worker.exe')
  const browsers = join(runtimeRoot, 'browsers')
  const environment = {
    browsers: existsSync(browsers) ? browsers : undefined,
    node: process.versions.electron ? process.execPath : undefined,
    tools: join(runtimeRoot, 'tools'),
  }
  if (existsSync(bundled))
    return {
      ready: true,
      message: '已加载随客户端打包的上传运行时。',
      command: bundled,
      prefix: [],
      schemas: readSchemas(bundled),
      ...environment,
    }
  const python = join(root, '.venv', 'Scripts', 'python.exe')
  const script = join(root, 'desktop', 'python', 'worker.py')
  if (existsSync(python) && existsSync(script))
    return {
      ready: true,
      message: '已加载开发环境上传运行时。',
      command: python,
      prefix: [script],
      ...environment,
    }
  return {
    ready: false,
    message: '上传运行时尚未准备好；账号、素材和草稿仍可使用。',
    command: python,
    prefix: [script],
  }
}
export function startWorker(
  runtime: WorkerRuntime,
  directory: string,
  request: WorkerRequest,
  onLog: (message: string) => void,
): WorkerHandle {
  if (!runtime.ready) throw new Error(runtime.message)
  const jobDirectory = join(directory, 'jobs', randomUUID())
  mkdirSync(jobDirectory, { recursive: true })
  const input = join(jobDirectory, 'request.json')
  const output = join(jobDirectory, 'result.json')
  writeFileSync(input, JSON.stringify({ ...request, dataDirectory: directory, jobDirectory }), {
    encoding: 'utf8',
    mode: 0o600,
  })
  let browserFolder: string | undefined
  if (runtime.browsers) {
    const libraryRoot = runtime.prefix.length
      ? join(dirname(dirname(runtime.command)), 'Lib', 'site-packages')
      : join(dirname(runtime.command), '_internal')
    const metadata = join(
      libraryRoot,
      request.platform === 'tiktok' ? 'playwright' : 'patchright',
      'driver',
      'package',
      'browsers.json',
    )
    if (existsSync(metadata)) {
      const data = JSON.parse(readFileSync(metadata, 'utf8')) as {
        browsers: { name: string; revision: string }[]
      }
      const revision = data.browsers.find((item) => item.name === 'chromium')?.revision
      if (revision) browserFolder = 'chromium-' + revision
    }
    browserFolder ||= readdirSync(runtime.browsers)
      .filter((name) => /^chromium-\d+$/.test(name))
      .sort()[0]
  }
  const chrome =
    browserFolder && join(runtime.browsers!, browserFolder, 'chrome-win64', 'chrome.exe')
  const child = spawn(
    runtime.command,
    [...runtime.prefix, '--request', input, '--result', output],
    {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONUTF8: '1',
        PYTHONUNBUFFERED: '1',
        SAU_DESKTOP_DATA: directory,
        ...(runtime.browsers ? { PLAYWRIGHT_BROWSERS_PATH: runtime.browsers } : {}),
        ...(chrome && existsSync(chrome) ? { SAU_CHROME_PATH: chrome } : {}),
        ...(runtime.tools ? { SAU_DESKTOP_TOOLS: runtime.tools } : {}),
        ...(runtime.node
          ? {
              SAU_ARTICLE_NODE: runtime.node,
              PLAYWRIGHT_NODEJS_PATH: runtime.node,
              ELECTRON_RUN_AS_NODE: '1',
            }
          : {}),
      },
    },
  )
  const lines = [createInterface({ input: child.stdout }), createInterface({ input: child.stderr })]
  let logCount = 0
  for (const stream of lines)
    stream.on('line', (line) => {
      if (logCount++ < 2000) onLog(redactLog(line))
    })
  let closed = false
  let stopping: Promise<void> | undefined
  const result = new Promise<WorkerResult>((resolve) => {
    child.once('error', (error) => {
      closed = true
      resolve({ ok: false, message: '无法启动上传进程：' + error.message })
    })
    child.once('close', () => {
      closed = true
      for (const stream of lines) stream.close()
      try {
        const value: unknown = JSON.parse(readFileSync(output, 'utf8'))
        if (!value || typeof value !== 'object' || typeof (value as WorkerResult).ok !== 'boolean')
          throw new Error('invalid result')
        resolve(value as WorkerResult)
      } catch {
        resolve({ ok: false, message: '上传进程退出时没有返回明确结果。' })
      }
    })
  })
  const cleanedResult = result.then(async (value) => {
    // These are transport files, not user assets or platform diagnostic artifacts.
    // Keep generated article sources/screenshots for later result verification.
    await Promise.allSettled(
      ['request.json', 'result.json', 'result.tmp', 'verify_code.txt'].map((name) =>
        unlink(join(jobDirectory, name)),
      ),
    )
    await rmdir(jobDirectory).catch(() => {}) // Only remove the directory if empty.
    return value
  })
  return {
    result: cleanedResult,
    verification(code: string) {
      if (!/^\d{4,12}$/.test(code)) throw new Error('请输入 4 到 12 位数字验证码。')
      writeFileSync(join(jobDirectory, 'verify_code.txt'), code, {
        encoding: 'utf8',
        mode: 0o600,
      })
    },
    async stop() {
      if (stopping) {
        await stopping
        return
      }
      if (closed || !child.pid) {
        await cleanedResult
        return
      }
      if (!stopping)
        stopping = (async () => {
          if (process.platform === 'win32') {
            await new Promise<void>((resolve, reject) => {
              const killer = spawn(
                join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'),
                ['/PID', String(child.pid), '/T', '/F'],
                { windowsHide: true, stdio: 'ignore' },
              )
              const timeout = setTimeout(() => {
                killer.kill()
                reject(new Error('停止进程树超时，请重试。'))
              }, 5000)
              killer.once('error', (error) => {
                clearTimeout(timeout)
                reject(new Error('无法停止进程树：' + error.message))
              })
              killer.once('close', (code) => {
                clearTimeout(timeout)
                if (code === 0 || closed) resolve()
                else reject(new Error('系统未能停止上传进程，请重试。'))
              })
            })
          } else child.kill('SIGTERM')
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(
              () => reject(new Error('上传进程尚未退出，请重试中断。')),
              5000,
            )
            void cleanedResult.then(() => {
              clearTimeout(timeout)
              resolve()
            })
          })
        })().catch((error: unknown) => {
          stopping = undefined
          throw error
        })
      await stopping
    },
  }
}
export function redactLog(line: string): string {
  const clean = line.replace(/\u001b\[[0-9;]*m/g, '')
  if (/cookie|authorization|password|access[_-]?token|storage_state/i.test(clean))
    return '[会话相关日志已隐藏]'
  return clean.slice(0, 4000)
}
