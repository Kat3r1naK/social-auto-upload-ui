import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { StudioStore } from '../store'
import { StudioService } from '../service'
import { redactLog, type WorkerHandle, type WorkerResult } from '../worker'
import type { ComposerForm, PublishTask } from '../../sau_frontend/src/types/studio'

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'sau-desktop-test-'))
  const store = new StudioStore(directory)
  return {
    directory,
    store,
    cleanup() {
      store.close()
      assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep + 'sau-desktop-test-'))
      rmSync(directory, { recursive: true, force: true })
    },
  }
}
const runtime = { ready: true, message: '', command: 'unused', prefix: [] }
const formFor = (accountId: string, assetId: string): ComposerForm => ({
  kind: 'video',
  title: '测试标题',
  description: '简介',
  tags: ['测试'],
  body: '',
  selectedAccountIds: [accountId],
  assets: [{ id: assetId, name: 'test.mp4', kind: 'video', size: 4 }],
  scheduleMode: 'now',
  scheduledAt: '',
  overrides: {},
})

test('persistent queue serializes each account, allows different accounts, and cannot double start', async () => {
  const f = fixture(),
    pending: { account?: string; resolve(result: WorkerResult): void }[] = []
  const service = new StudioService(
    f.store,
    runtime,
    'test',
    () => {},
    (_runtime, _directory, request) => {
      if (request.action === 'schema')
        return {
          result: Promise.resolve({ ok: true, message: '', options: [] }),
          stop: async () => {},
        }
      let done!: (result: WorkerResult) => void
      const result = new Promise<WorkerResult>((resolve) => {
        done = resolve
      })
      pending.push({ account: request.account, resolve: done })
      return {
        result,
        stop: async () => {
          done({ ok: false, message: 'stopped' })
        },
      }
    },
  )
  try {
    const file = join(f.directory, 'test.mp4')
    writeFileSync(file, 'test')
    const asset = service.importFile(file)
    const a = service.saveAccount({
      platformId: 'douyin',
      name: 'A',
      group: '',
    })
    const b = service.saveAccount({
      platformId: 'douyin',
      name: 'B',
      group: '',
    })
    f.store.saveAccountData({ ...a, status: 'valid' })
    f.store.saveAccountData({ ...b, status: 'valid' })
    await service.enqueue(formFor(String(a.id), String(asset.id)))
    await service.enqueue(formFor(String(a.id), String(asset.id)))
    await service.enqueue(formFor(String(b.id), String(asset.id)))
    const tasks = f.store.tasks().reverse()
    tasks.forEach((task) => service.startTask(task.id))
    assert.equal(pending.length, 2)
    assert.notEqual(pending[0].account, pending[1].account)
    assert.throws(() => service.startTask(tasks[0].id), /重复/)
    assert.equal(f.store.tasks().filter((task) => task.status === 'running').length, 2)
    pending[0].resolve({ ok: true, message: 'submitted' })
    pending[1].resolve({ ok: false, message: 'network lost' })
    await new Promise((resolve) => setTimeout(resolve, 1200))
    assert.equal(pending.length, 3)
    assert.equal(f.store.task(tasks[0].id)?.status, 'submitted')
    assert.equal(f.store.task(tasks[2].id)?.status, 'unknown')
    assert.equal(f.store.task(tasks[1].id)?.status, 'running')
    pending[2].resolve({ ok: true, message: '' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.ok(f.store.events(tasks[0].id).length >= 3)
  } finally {
    await service.stop()
    f.cleanup()
  }
})

test('restart restores data, converts running to unknown, and marks overdue schedules missed', () => {
  const f = fixture()
  const base = {
    id: 'one',
    batchId: 'batch',
    mode: 'live',
    kind: 'article',
    account: {
      id: 'a',
      platformId: 'zhihu',
      name: 'A',
      group: '',
      status: 'valid',
    },
    title: '标题',
    description: '',
    body: '正文',
    tags: [],
    assets: [],
    scheduleMode: 'now',
    scheduledAt: '',
    status: 'running',
    createdAt: Date.now(),
    message: '',
  } as PublishTask
  f.store.insertTasks([
    base,
    {
      ...base,
      id: 'two',
      scheduleMode: 'later',
      scheduledAt: new Date(Date.now() - 60000).toISOString(),
      status: 'scheduled',
    },
  ])
  f.store.updateTask('two', 'scheduled', 'waiting', true)
  f.store.saveWorkspace({
    mode: 'live',
    theme: 'light',
    sampleAccounts: [],
    sampleMaterials: [],
    drafts: [],
    tasks: [base],
  })
  f.store.close()
  const reopened = new StudioStore(f.directory)
  try {
    assert.equal(reopened.task('one')?.status, 'unknown')
    assert.equal(reopened.task('two')?.status, 'missed')
    assert.equal(reopened.workspace()?.theme, 'light')
    assert.equal(reopened.workspace()?.tasks.length, 0)
  } finally {
    reopened.close()
    assert.ok(resolve(f.directory).startsWith(resolve(tmpdir()) + sep + 'sau-desktop-test-'))
    rmSync(f.directory, { recursive: true, force: true })
  }
})

test('changed/missing files and unverified accounts cannot enter a batch; cancelling prevents execution', async () => {
  const f = fixture()
  let published = false
  const service = new StudioService(
    f.store,
    runtime,
    'test',
    () => {},
    (_r, _d, request): WorkerHandle => {
      if (request.action !== 'schema') published = true
      return {
        result: Promise.resolve({ ok: true, message: '', options: [] }),
        stop: async () => {},
      }
    },
  )
  try {
    const file = join(f.directory, 'test.mp4')
    writeFileSync(file, 'test')
    const asset = service.importFile(file),
      account = service.saveAccount({
        platformId: 'douyin',
        name: 'A',
        group: '',
      })
    const form = formFor(String(account.id), String(asset.id))
    await assert.rejects(() => service.enqueue(form), /未验证/)
    f.store.saveAccountData({ ...account, status: 'valid' })
    await service.enqueue(form)
    const task = f.store.tasks()[0]
    service.cancelTask(task.id)
    assert.throws(() => service.startTask(task.id))
    assert.equal(published, false)
    writeFileSync(file, 'changed contents')
    await assert.rejects(() => service.enqueue(form), /发生变化/)
    assert.equal(f.store.tasks().length, 1)
    service.removeMaterial(String(asset.id))
    assert.equal(f.store.materials().length, 0)
  } finally {
    await service.stop()
    f.cleanup()
  }
})

test('session-like log lines are not exposed in queue diagnostics', () => {
  assert.equal(redactLog('cookie sessionid=secret'), '[会话相关日志已隐藏]')
  assert.equal(redactLog('Authorization: Bearer secret'), '[会话相关日志已隐藏]')
  assert.equal(redactLog('\u001b[32mUploading video\u001b[0m'), 'Uploading video')
})

test('interrupting stops only the chosen task, holds its account lock, and ignores late success', async () => {
  const f = fixture()
  const pending = new Map<
    string,
    { finish(result: WorkerResult): void; releaseStop(): void; stops: number }
  >()
  const service = new StudioService(
    f.store,
    runtime,
    'test',
    () => {},
    (_r, _d, request) => {
      if (request.action === 'schema')
        return {
          result: Promise.resolve({ ok: true, message: '', options: [] }),
          stop: async () => {},
        }
      let finish!: (result: WorkerResult) => void, releaseStop!: () => void
      const result = new Promise<WorkerResult>((resolve) => {
        finish = resolve
      })
      const stopping = new Promise<void>((resolve) => {
        releaseStop = resolve
      })
      const entry = { finish, releaseStop, stops: 0 }
      pending.set((request.task as PublishTask).id, entry)
      return {
        result,
        stop: async () => {
          entry.stops++
          await stopping
        },
      }
    },
  )
  try {
    const file = join(f.directory, 'test.mp4')
    writeFileSync(file, 'test')
    const asset = service.importFile(file)
    const a = service.saveAccount({
      platformId: 'douyin',
      name: 'A',
      group: '',
    })
    const b = service.saveAccount({
      platformId: 'douyin',
      name: 'B',
      group: '',
    })
    f.store.saveAccountData({ ...a, status: 'valid' })
    f.store.saveAccountData({ ...b, status: 'valid' })
    await service.enqueue(formFor(String(a.id), String(asset.id)))
    await service.enqueue(formFor(String(a.id), String(asset.id)))
    await service.enqueue(formFor(String(b.id), String(asset.id)))
    const [first, next, other] = f.store.tasks().reverse()
    for (const task of [first, next, other]) service.startTask(task.id)
    const stop = service.interruptTask(first.id)
    const duplicateStop = service.interruptTask(first.id)
    assert.equal(stop, duplicateStop)
    await new Promise((resolve) => setTimeout(resolve, 0))
    const target = pending.get(first.id)!
    assert.equal(target.stops, 1)
    // The worker can return success while its browser process tree is still being stopped.
    target.finish({ ok: true, message: 'late success' })
    await new Promise((resolve) => setTimeout(resolve, 1100))
    assert.equal(f.store.task(first.id)?.status, 'running')
    assert.equal(f.store.task(next.id)?.status, 'queued')
    assert.equal(f.store.task(other.id)?.status, 'running')
    target.releaseStop()
    await stop
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.equal(f.store.task(first.id)?.status, 'unknown')
    assert.equal(f.store.task(first.id)?.armed, false)
    assert.match(f.store.task(first.id)!.message, /中断.*核验/)
    await new Promise((resolve) => setTimeout(resolve, 1100))
    assert.equal(f.store.task(next.id)?.status, 'running')
    assert.equal(pending.get(other.id)?.stops, 0)
    pending.get(next.id)!.finish({ ok: true, message: '' })
    pending.get(other.id)!.finish({ ok: true, message: '' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.throws(() => service.interruptTask(first.id), /没有运行中的/)
  } finally {
    for (const entry of pending.values()) {
      entry.releaseStop()
      entry.finish({ ok: false, message: '' })
    }
    await new Promise((resolve) => setTimeout(resolve, 0))
    await service.stop()
    f.cleanup()
  }
})

test('a failed interruption stays visible and may be retried instead of claiming cancellation', async () => {
  const f = fixture()
  let finish!: (result: WorkerResult) => void
  let stops = 0
  const service = new StudioService(
    f.store,
    runtime,
    'test',
    () => {},
    (_r, _d, request) => {
      if (request.action === 'schema')
        return {
          result: Promise.resolve({ ok: true, message: '', options: [] }),
          stop: async () => {},
        }
      return {
        result: new Promise<WorkerResult>((resolve) => {
          finish = resolve
        }),
        stop: async () => {
          if (++stops === 1) throw new Error('fixture process tree failure')
          finish({ ok: false, message: 'terminated' })
        },
      }
    },
  )
  try {
    const file = join(f.directory, 'test.mp4')
    writeFileSync(file, 'test')
    const asset = service.importFile(file)
    const account = service.saveAccount({
      platformId: 'douyin',
      name: 'A',
      group: '',
    })
    f.store.saveAccountData({ ...account, status: 'valid' })
    await service.enqueue(formFor(String(account.id), String(asset.id)))
    const task = f.store.tasks()[0]
    service.startTask(task.id)
    await assert.rejects(service.interruptTask(task.id), /fixture process tree failure/)
    assert.equal(f.store.task(task.id)?.status, 'running')
    assert.match(f.store.task(task.id)!.message, /中断未完成/)
    await service.interruptTask(task.id)
    assert.equal(f.store.task(task.id)?.status, 'unknown')
    assert.equal(stops, 2)
  } finally {
    finish?.({ ok: false, message: '' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    await service.stop()
    f.cleanup()
  }
})

test('imported sessions stay private and unverified; duplicate import is idempotent and unlink preserves the original', async () => {
  const f = fixture()
  const service = new StudioService(f.store, runtime, 'test')
  try {
    const { mkdirSync, readFileSync, existsSync } = await import('node:fs')
    const sourceDirectory = join(f.directory, 'original')
    mkdirSync(join(sourceDirectory, 'cookies'), { recursive: true })
    const original = join(sourceDirectory, 'cookies', 'facebook-page_creator.json')
    writeFileSync(
      original,
      JSON.stringify({
        cookies: [{ name: 'session', value: 'fixture-secret' }],
        origins: [],
      }),
    )
    assert.equal(service.importAccounts(sourceDirectory), 1)
    assert.equal(service.importAccounts(sourceDirectory), 0)
    const account = f.store.accounts()[0]
    assert.equal(account.platformId, 'facebook-page')
    assert.equal(account.status, 'unverified')
    assert.equal(JSON.stringify(service.snapshot()).includes('fixture-secret'), false)
    const copy = join(f.directory, 'cookies', 'facebook-page_' + account.id + '.json')
    assert.ok(readFileSync(copy, 'utf8').includes('fixture-secret'))
    service.removeAccount(String(account.id))
    assert.equal(existsSync(copy), false)
    assert.equal(existsSync(original), true)
    assert.equal(service.importAccounts(sourceDirectory), 1)
  } finally {
    await service.stop()
    f.cleanup()
  }
})

test('a schedule missed during sleep is not silently published when the queue wakes', async () => {
  const f = fixture()
  let published = false
  const service = new StudioService(
    f.store,
    runtime,
    'test',
    () => {},
    () => {
      published = true
      return {
        result: Promise.resolve({ ok: true, message: '' }),
        stop: async () => {},
      }
    },
  )
  try {
    const task = {
      id: 'sleep',
      batchId: 'batch',
      mode: 'live',
      kind: 'article',
      account: {
        id: 'a',
        platformId: 'zhihu',
        name: 'A',
        group: '',
        status: 'valid',
      },
      title: '标题',
      description: '',
      body: '正文',
      tags: [],
      assets: [],
      scheduleMode: 'later',
      scheduledAt: new Date(Date.now() - 120000).toISOString(),
      status: 'scheduled',
      createdAt: Date.now(),
      message: '',
    } as PublishTask
    f.store.insertTasks([task])
    f.store.updateTask(task.id, 'scheduled', 'waiting', true)
    await new Promise((resolve) => setTimeout(resolve, 1200))
    assert.equal(f.store.task(task.id)?.status, 'missed')
    assert.equal(published, false)
  } finally {
    await service.stop()
    f.cleanup()
  }
})
