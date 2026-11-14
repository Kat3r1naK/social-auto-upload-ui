import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { StudioStore } from '../store'
import { StudioService } from '../service'
import { startWorker, type WorkerResult } from '../worker'
import type { PublishTask } from '../../sau_frontend/src/types/studio'

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'sau-resources-test-'))
  return {
    directory,
    cleanup() {
      assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep + 'sau-resources-test-'))
      rmSync(directory, { recursive: true, force: true })
    },
  }
}

test('indexed queue includes only armed due tasks in insertion order', () => {
  const f = fixture(),
    store = new StudioStore(f.directory)
  try {
    const now = Date.now()
    const base = {
      id: 'history',
      account: { id: 'a' },
      status: 'submitted',
      scheduleMode: 'now',
    } as PublishTask
    store.insertTasks([
      base,
      { ...base, id: 'manual', status: 'queued' },
      { ...base, id: 'now', status: 'queued', armed: true },
      {
        ...base,
        id: 'future',
        status: 'scheduled',
        armed: true,
        scheduleMode: 'later',
        scheduledAt: new Date(now + 60000).toISOString(),
      },
      {
        ...base,
        id: 'due',
        status: 'scheduled',
        armed: true,
        scheduleMode: 'later',
        scheduledAt: new Date(now - 1000).toISOString(),
      },
    ])
    for (const id of ['now', 'future', 'due']) {
      const task = store.task(id)!
      store.updateTask(id, task.status, '', true)
    }
    assert.deepEqual(
      store.queuedTasks(now).map((task) => task.id),
      ['now', 'due'],
    )
    assert.equal(store.task('manual')?.id, 'manual')
    assert.equal(store.task('missing'), undefined)
    assert.equal(store.hasScheduledTasks(), true)
    for (const id of ['now', 'future', 'due']) store.updateTask(id, 'cancelled', '', false)
    assert.deepEqual(store.queuedTasks(now), [])
    assert.equal(store.hasScheduledTasks(), false)
  } finally {
    store.close()
    f.cleanup()
  }
})

test('concurrent platform schema requests share one worker and a failed request can retry', async () => {
  const f = fixture(),
    store = new StudioStore(f.directory)
  let finish!: (result: WorkerResult) => void,
    starts = 0
  const service = new StudioService(
    store,
    { ready: true, message: '', command: '', prefix: [] },
    'test',
    () => {},
    () => {
      starts++
      return {
        result: new Promise((resolve) => {
          finish = resolve
        }),
        stop: async () => {},
      }
    },
  )
  try {
    const a = service.options('douyin', 'video'),
      b = service.options('douyin', 'video')
    await Promise.resolve()
    assert.equal(starts, 1)
    finish({ ok: false, message: 'schema fixture failure' })
    await assert.rejects(a, /schema fixture failure/)
    await assert.rejects(b, /schema fixture failure/)
    const retry = service.options('douyin', 'video')
    await Promise.resolve()
    assert.equal(starts, 2)
    finish({ ok: true, message: '', options: [] })
    assert.deepEqual(await retry, [])
    assert.deepEqual(await service.options('douyin', 'video'), [])
    assert.equal(starts, 2)
  } finally {
    await service.stop()
    store.close()
    f.cleanup()
  }
})

test('worker transport files are removed after exit while diagnostic artifacts are retained', async () => {
  const f = fixture()
  const script = join(f.directory, 'worker.cjs')
  writeFileSync(
    script,
    `
    const fs = require('node:fs'), path = require('node:path');
    const input = process.argv[process.argv.indexOf('--request') + 1];
    const output = process.argv[process.argv.indexOf('--result') + 1];
    const request = JSON.parse(fs.readFileSync(input, 'utf8'));
    if (request.action === 'publish') fs.writeFileSync(path.join(request.jobDirectory, 'content.md'), 'diagnostic source');
    fs.writeFileSync(output, JSON.stringify({ok: true, message: 'complete'}));
  `,
  )
  try {
    const runtime = { ready: true, message: '', command: process.execPath, prefix: [script] }
    assert.equal(
      (
        await startWorker(runtime, f.directory, { platform: 'fixture', action: 'schema' }, () => {})
          .result
      ).ok,
      true,
    )
    assert.deepEqual(readdirSync(join(f.directory, 'jobs')), [])
    assert.equal(
      (
        await startWorker(
          runtime,
          f.directory,
          { platform: 'fixture', action: 'publish' },
          () => {},
        ).result
      ).ok,
      true,
    )
    const [job] = readdirSync(join(f.directory, 'jobs'))
    assert.deepEqual(readdirSync(join(f.directory, 'jobs', job)), ['content.md'])
    assert.equal(
      readFileSync(join(f.directory, 'jobs', job, 'content.md'), 'utf8'),
      'diagnostic source',
    )
    assert.equal(existsSync(join(f.directory, 'worker.cjs')), true)
    const failed = startWorker(
      { ...runtime, command: join(f.directory, 'missing.exe') },
      f.directory,
      { platform: 'fixture', action: 'schema' },
      () => {},
    )
    assert.equal((await failed.result).ok, false)
    assert.deepEqual(readdirSync(join(f.directory, 'jobs')), [job])
  } finally {
    f.cleanup()
  }
})

test('different platform schemas run sequentially to bound Python process memory', async () => {
  const f = fixture(),
    store = new StudioStore(f.directory)
  const pending: ((result: WorkerResult) => void)[] = []
  const service = new StudioService(
    store,
    { ready: true, message: '', command: '', prefix: [] },
    'test',
    () => {},
    () => ({
      result: new Promise((resolve) => {
        pending.push(resolve)
      }),
      stop: async () => {},
    }),
  )
  try {
    const a = service.options('douyin', 'video'),
      b = service.options('kuaishou', 'video')
    await Promise.resolve()
    assert.equal(pending.length, 1)
    pending[0]({ ok: true, message: '', options: [] })
    await a
    await Promise.resolve()
    assert.equal(pending.length, 2)
    pending[1]({ ok: true, message: '', options: [] })
    await b
  } finally {
    await service.stop()
    store.close()
    f.cleanup()
  }
})
