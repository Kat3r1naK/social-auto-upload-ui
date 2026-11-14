import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { StudioStore } from '../store'
import { StudioService } from '../service'
import { resolveRuntime, type WorkerResult } from '../worker'
import type { PublishTask } from '../../sau_frontend/src/types/studio'

const tick = () => new Promise((done) => setTimeout(done, 0))
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'sau-performance-test-'))
  const store = new StudioStore(directory)
  return {
    directory,
    store,
    cleanup() {
      store.close()
      assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep + 'sau-performance-test-'))
      rmSync(directory, { recursive: true, force: true })
    },
  }
}
function task(index: number): PublishTask {
  return {
    id: 'task-' + index,
    batchId: 'batch',
    mode: 'live',
    kind: 'article',
    account: {
      id: 'account',
      platformId: 'zhihu',
      name: '作者',
      group: '',
      status: 'valid',
    },
    title: index === 42 ? '100% 完成' : '文章 ' + index,
    description: '简介'.repeat(1000),
    body: '正文'.repeat(4096),
    tags: ['标签'],
    assets: [],
    scheduleMode: 'now',
    scheduledAt: '',
    status: index < 3 ? 'queued' : 'submitted',
    createdAt: index,
    message: '',
  }
}
const runtime = { ready: true, message: '', command: '', prefix: [] }

test('prepared platform options avoid Python startup and stale worker metadata is ignored', async () => {
  const f = fixture()
  const workerDirectory = join(f.directory, 'worker')
  mkdirSync(workerDirectory)
  const executable = join(workerDirectory, 'sau-worker.exe')
  writeFileSync(executable, 'fixture worker version 1')
  writeFileSync(
    join(workerDirectory, 'platform-options.json'),
    JSON.stringify({
      workerHash: createHash('sha256').update(readFileSync(executable)).digest('hex'),
      options: { 'douyin:video': [] },
    }),
  )
  const prepared = resolveRuntime(f.directory, f.directory)
  const service = new StudioService(
    f.store,
    prepared,
    'test',
    () => {},
    () => {
      throw new Error('Unexpected Python startup')
    },
  )
  try {
    assert.deepEqual(await service.options('douyin', 'video'), [])
    writeFileSync(executable, 'fixture worker version 2')
    assert.equal(resolveRuntime(f.directory, f.directory).schemas, undefined)
    writeFileSync(join(workerDirectory, 'platform-options.json'), '{invalid')
    assert.equal(resolveRuntime(f.directory, f.directory).schemas, undefined)
  } finally {
    await service.stop()
    f.cleanup()
  }
})

test('database pages omit heavy content, retain complete details, and count beyond the first page', async () => {
  const f = fixture(),
    service = new StudioService(f.store, runtime, 'test')
  try {
    f.store.insertTasks(Array.from({ length: 130 }, (_, index) => task(index)))
    f.store.saveMaterial({
      id: 'article',
      name: '文章.md',
      kind: 'article',
      size: 4,
      body: '素材正文',
    })
    const first = service.snapshot(false)
    assert.equal(first.workspace, undefined)
    assert.equal(first.tasks.length, 25)
    assert.deepEqual(first.taskCounts, { total: 130, pending: 3, running: 0 })
    assert.equal('body' in first.tasks[0], false)
    assert.equal('description' in first.tasks[0], false)
    assert.equal(first.materials[0].body, undefined)
    assert.equal(f.store.material('article')?.body, '素材正文')
    const second = service.taskPage({ page: 2 })
    assert.equal(second.items[0].id, 'task-104')
    assert.equal(service.taskPage({ page: 999 }).page, 6)
    assert.equal(service.taskPage({ query: '%' }).items[0].id, 'task-42')
    assert.equal(service.taskPage({ query: '知乎', history: true }).total, 127)
    assert.equal(service.taskPage({ status: 'queued', history: true }).total, 0)
    assert.throws(() => service.taskPage({ pageSize: 1000 }))
    assert.throws(() => service.taskPage({ query: 1 } as never))
    assert.equal(f.store.task('task-104')?.body, task(104).body)
    const output = join(f.directory, 'export.json')
    await service.exportContent(output, 'tasks')
    const exported = JSON.parse(readFileSync(output, 'utf8')) as PublishTask[]
    assert.equal(exported.length, 130)
    assert.equal(exported[0].body, task(129).body)
    await service.exportContent(output, 'workspace', { query: '100%' })
    const workspace = JSON.parse(readFileSync(output, 'utf8'))
    assert.equal(workspace.tasks.length, 1)
    assert.equal(workspace.tasks[0].id, 'task-42')
  } finally {
    await service.stop()
    f.cleanup()
  }
})

test('account operations and schemas share the global limit; lowering it does not stop active work', async () => {
  const f = fixture()
  const started: { action: string; finish(value: WorkerResult): void }[] = []
  const service = new StudioService(
    f.store,
    runtime,
    'test',
    () => {},
    (_runtime, _directory, request) => {
      let finish!: (value: WorkerResult) => void
      const result = new Promise<WorkerResult>((done) => {
        finish = done
      })
      started.push({ action: request.action, finish })
      return {
        result,
        stop: async () => finish({ ok: false, message: 'stopped' }),
      }
    },
  )
  const accounts = Array.from({ length: 4 }, (_, index) =>
    service.saveAccount({ platformId: 'douyin', name: 'A' + index, group: '' }),
  )
  const operations = accounts.map((account) => service.accountAction(String(account.id), 'check'))
  try {
    assert.equal(started.length, 2)
    assert.equal(service.running, true)
    service.setMaxWorkers(1)
    started[0].finish({ ok: true, message: '' })
    await tick()
    assert.equal(started.length, 2)
    started[1].finish({ ok: true, message: '' })
    await tick()
    assert.equal(started.length, 3)
    service.setMaxWorkers(2)
    assert.equal(started.length, 4)
    const schema = service.options('douyin', 'video')
    await tick()
    assert.equal(started.length, 4)
    started[2].finish({ ok: true, message: '' })
    await tick()
    assert.equal(started.length, 5)
    assert.equal(started[4].action, 'schema')
    started[3].finish({ ok: true, message: '' })
    started[4].finish({ ok: true, message: '', options: [] })
    await Promise.all([...operations, schema])
    assert.equal(service.running, false)
    assert.throws(() => service.setMaxWorkers(3), /并发数/)
  } finally {
    await service.stop()
    await Promise.allSettled(operations)
    f.cleanup()
  }
})

test('shutdown rejects waiting work without spawning another worker or leaving accounts checking', async () => {
  const f = fixture()
  let starts = 0
  const service = new StudioService(
    f.store,
    runtime,
    'test',
    () => {},
    () => {
      starts++
      let finish!: (value: WorkerResult) => void
      return {
        result: new Promise<WorkerResult>((done) => {
          finish = done
        }),
        stop: async () => finish({ ok: false, message: 'stopped' }),
      }
    },
  )
  service.setMaxWorkers(1)
  const a = service.saveAccount({ platformId: 'douyin', name: 'A', group: '' })
  const b = service.saveAccount({ platformId: 'douyin', name: 'B', group: '' })
  const first = service.accountAction(String(a.id), 'login')
  const waiting = service.accountAction(String(b.id), 'login')
  const rejected = assert.rejects(waiting, /退出/)
  try {
    await service.stop()
    await first
    await rejected
    assert.equal(starts, 1)
    assert.equal(service.running, false)
    assert.equal(f.store.account(String(b.id))?.status, 'unverified')
  } finally {
    await service.stop()
    f.cleanup()
  }
})
