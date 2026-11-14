import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { startWorker } from '../worker'

async function waitFor(check: () => boolean) {
  const deadline = Date.now() + 5000
  while (!check()) {
    if (Date.now() >= deadline) throw new Error('Fixture process did not reach the expected state')
    await new Promise((resolve) => setTimeout(resolve, 40))
  }
}
function isAlive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false
    throw error
  }
}

test(
  'Windows interruption terminates a hung worker and its spawned child process',
  { skip: process.platform !== 'win32' },
  async () => {
    const directory = mkdtempSync(join(tmpdir(), 'sau-stop-test-'))
    const childPid = join(directory, 'child-pid')
    const heartbeat = join(directory, 'heartbeat')
    const script = join(directory, 'hung-worker.cjs')
    const childCode = `setInterval(() => require('node:fs').appendFileSync(${JSON.stringify(heartbeat)}, '.'), 40)`
    writeFileSync(
      script,
      `
    const child = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(childCode)}], { windowsHide: true, stdio: 'ignore' });
    require('node:fs').writeFileSync(${JSON.stringify(childPid)}, String(child.pid));
    setInterval(() => {}, 1000);
  `,
    )
    const handle = startWorker(
      { ready: true, message: '', command: process.execPath, prefix: [script] },
      directory,
      { platform: 'fixture', action: 'publish' },
      () => {},
    )
    try {
      await waitFor(() => existsSync(childPid) && existsSync(heartbeat))
      const pid = Number(readFileSync(childPid, 'utf8'))
      assert.ok(pid > 0 && isAlive(pid))
      await Promise.all([handle.stop(), handle.stop()])
      await waitFor(() => !isAlive(pid))
      assert.equal((await handle.result).ok, false)
      const finalHeartbeat = readFileSync(heartbeat, 'utf8')
      await new Promise((resolve) => setTimeout(resolve, 150))
      assert.equal(readFileSync(heartbeat, 'utf8'), finalHeartbeat)
    } finally {
      await handle.stop()
      assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep + 'sau-stop-test-'))
      rmSync(directory, { recursive: true, force: true })
    }
  },
)
