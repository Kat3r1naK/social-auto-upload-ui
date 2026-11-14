import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { performance } from 'node:perf_hooks'
import { StudioStore } from '../store'
import type { PublishTask } from '../../sau_frontend/src/types/studio'

const directory = mkdtempSync(join(tmpdir(), 'sau-benchmark-'))
const store = new StudioStore(directory)
try {
  const base = {
    account: { id: 'a' },
    status: 'submitted',
    body: '正文'.repeat(4096),
    scheduleMode: 'now',
    armed: false,
  } as PublishTask
  store.insertTasks(
    Array.from({ length: 1000 }, (_, index) => ({ ...base, id: 'history-' + index })),
  )
  store.insertTasks([{ ...base, id: 'due', status: 'queued', armed: true }])
  store.updateTask('due', 'queued', '', true)
  const measure = (action: () => unknown) => {
    action()
    const start = performance.now()
    for (let index = 0; index < 30; index++) action()
    return Number(((performance.now() - start) / 30).toFixed(3))
  }
  console.log(
    JSON.stringify(
      {
        fixture: '1000 historical tasks with 8K characters each; 1 due task; 30 iterations',
        lookupMs: {
          before: measure(() => store.tasks().find((task) => task.id === 'history-0')),
          after: measure(() => store.task('history-0')),
        },
        queueReadMs: {
          before: measure(() =>
            store
              .tasks()
              .reverse()
              .filter((task) => task.armed && task.status === 'queued'),
          ),
          after: measure(() => store.queuedTasks()),
        },
        taskListPayloadBytes: {
          before: Buffer.byteLength(JSON.stringify(store.tasks())),
          after: Buffer.byteLength(JSON.stringify({ ...store.taskPage(), counts: store.taskCounts() })),
        },
      },
      null,
      2,
    ),
  )
} finally {
  store.close()
  assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep + 'sau-benchmark-'))
  rmSync(directory, { recursive: true, force: true })
}
