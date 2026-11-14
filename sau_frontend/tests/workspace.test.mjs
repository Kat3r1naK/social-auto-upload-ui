import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createPinia } from 'pinia'

let server, useStudioStore, createComposer
const info = { version: 'test', workerReady: true, workerMessage: '', dataDirectory: 'test' }
const snapshot = () => ({ accounts: [], materials: [], tasks: [], info })
let writes
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
function environment(data = snapshot()) {
  writes = []
  globalThis.localStorage = { getItem: () => null, setItem() {} }
  globalThis.document = { documentElement: { dataset: {}, style: {} } }
  globalThis.window = {
    sauDesktop: {
      snapshot: async () => data,
      saveWorkspace: async (workspace) => writes.push(workspace),
      onChanged: () => () => {},
    },
  }
}
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  ;({ useStudioStore, createComposer } = await server.ssrLoadModule('/src/stores/studio.ts'))
})
after(async () => {
  await server?.close()
  delete globalThis.window
  delete globalThis.document
  delete globalThis.localStorage
})

test('a clean desktop starts with real empty data and a blank composer', async () => {
  environment()
  const store = useStudioStore(createPinia())
  try {
    assert.equal(store.mode, 'live')
    assert.equal(store.accounts.length, 0)
    assert.equal(store.materials.length, 0)
    await store.initializeDesktop()
    assert.equal(store.connection, 'connected')
    assert.equal(writes.at(-1).mode, 'live')
    const form = createComposer('video', store.mode === 'demo')
    assert.equal(form.title, '')
    assert.deepEqual(form.assets, [])
    assert.deepEqual(form.selectedAccountIds, [])
    assert.throws(() => store.setMode('demo'), /本机工作区/)
  } finally {
    store.$dispose()
  }
})

test('upgrading an old demo workspace shows real accounts and keeps existing drafts', async () => {
  const account = {
    id: 'real-account',
    platformId: 'douyin',
    name: 'Real',
    group: '',
    status: 'unverified',
  }
  const draft = {
    ...createComposer('article', false),
    id: 'real-draft',
    mode: 'live',
    updatedAt: 1,
  }
  environment({
    ...snapshot(),
    accounts: [account],
    workspace: {
      mode: 'demo',
      theme: 'light',
      sampleAccounts: [{ ...account, id: 'sample-account' }],
      sampleMaterials: [],
      drafts: [draft],
      tasks: [],
    },
  })
  const store = useStudioStore(createPinia())
  try {
    await store.initializeDesktop()
    assert.equal(store.mode, 'live')
    assert.equal(store.theme, 'light')
    assert.deepEqual(
      store.accounts.map((item) => item.id),
      ['real-account'],
    )
    assert.deepEqual(
      store.currentDrafts.map((item) => item.id),
      ['real-draft'],
    )
    assert.equal(writes.at(-1).mode, 'live')
    assert.equal(writes.at(-1).drafts.length, 1)
  } finally {
    store.$dispose()
  }
})

test('a database error is visible and never falls back to fake desktop accounts', async () => {
  environment()
  window.sauDesktop.snapshot = async () => {
    throw new Error('fixture database failure')
  }
  const store = useStudioStore(createPinia())
  try {
    await store.initializeDesktop()
    assert.match(store.storageError, /fixture database failure/)
    assert.equal(store.mode, 'live')
    assert.deepEqual(store.accounts, [])
    assert.deepEqual(writes, [])
  } finally {
    store.$dispose()
  }
})

test('browser previews still have an explicitly separate demo workspace', () => {
  environment()
  delete window.sauDesktop
  const store = useStudioStore(createPinia())
  try {
    assert.equal(store.desktop, false)
    assert.equal(store.mode, 'demo')
    assert.equal(store.accounts.length, 3)
  } finally {
    store.$dispose()
  }
})

test('desktop task refreshes never save live history back into workspace settings', async () => {
  const data = {
    ...snapshot(),
    tasks: [{ id: 'live-task', mode: 'live', status: 'queued', body: 'large history' }],
  }
  environment(data)
  const store = useStudioStore(createPinia())
  try {
    await store.initializeDesktop()
    assert.deepEqual(writes.at(-1).tasks, [])
    const count = writes.length
    data.tasks[0] = { ...data.tasks[0], status: 'running' }
    await store.refreshData()
    await tick()
    assert.equal(store.currentTasks[0].status, 'running')
    assert.equal(writes.length, count)
    store.theme = 'light'
    await tick()
    assert.equal(writes.at(-1).theme, 'light')
    assert.deepEqual(writes.at(-1).tasks, [])
  } finally {
    store.$dispose()
  }
})

test('desktop change bursts share a request, recheck fresh data, and release their listener', async () => {
  environment()
  let notify,
    unsubscribed = false
  window.sauDesktop.onChanged = (callback) => {
    notify = callback
    return () => {
      unsubscribed = true
    }
  }
  const store = useStudioStore(createPinia())
  try {
    await store.initializeDesktop()
    const requests = []
    window.sauDesktop.snapshot = () => new Promise((resolve) => requests.push(resolve))
    const first = store.refreshData()
    const second = store.refreshData()
    notify()
    assert.equal(requests.length, 1)
    assert.equal(store.loading, true)
    requests[0](snapshot())
    await tick()
    assert.equal(requests.length, 2)
    requests[1]({ ...snapshot(), accounts: [{ id: 'latest' }] })
    await Promise.all([first, second])
    assert.equal(store.accounts[0].id, 'latest')
    assert.equal(store.loading, false)
    window.sauDesktop.snapshot = async () => {
      throw new Error('offline fixture')
    }
    await assert.rejects(store.refreshData(), /offline fixture/)
    assert.equal(store.connection, 'offline')
    assert.match(store.connectionError, /offline fixture/)
    assert.equal(store.accounts[0].id, 'latest')
  } finally {
    store.$dispose()
  }
  assert.equal(unsubscribed, true)
})

test('background suspension flushes the active editor and waits for durable workspace writes', async () => {
  environment({ ...snapshot(), taskCounts: { total: 2000, pending: 120, running: 1 } })
  let prepare, released = false
  window.sauDesktop.onPrepareSuspend = (callback) => { prepare = callback; return () => { released = true } }
  const store = useStudioStore(createPinia())
  try {
    await store.initializeDesktop()
    assert.equal(store.pendingTaskCount, 120)
    assert.equal(store.busy, true)
    const form = createComposer('article', false)
    form.body = '最后一次编辑尚未触发自动保存'
    const remove = store.onBeforeSuspend(() => { store.saveDraft(form) })
    let finishWrite, suspended = false
    window.sauDesktop.saveWorkspace = (workspace) => {
      writes.push(workspace)
      return new Promise((done) => { finishWrite = done })
    }
    const pending = prepare().then(() => { suspended = true })
    await tick()
    assert.equal(suspended, false)
    assert.equal(writes.at(-1).drafts[0].body, form.body)
    finishWrite()
    await pending
    assert.equal(suspended, true)
    remove()
    let includeWorkspace
    window.sauDesktop.snapshot = async (value) => { includeWorkspace = value; return snapshot() }
    await store.refreshData()
    assert.equal(includeWorkspace, false)
  } finally { store.$dispose() }
  assert.equal(released, true)
})

test('failed draft persistence prevents background suspension', async () => {
  environment()
  let prepare
  window.sauDesktop.onPrepareSuspend = (callback) => { prepare = callback; return () => {} }
  const store = useStudioStore(createPinia())
  try {
    await store.initializeDesktop()
    window.sauDesktop.saveWorkspace = async () => { throw new Error('disk full fixture') }
    store.onBeforeSuspend(() => { store.saveDraft(createComposer('article', false)) })
    await assert.rejects(prepare(), /disk full fixture/)
    assert.match(store.storageError, /disk full fixture/)
  } finally { store.$dispose() }
})
