import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type {
  Account,
  ComposerForm,
  Material,
  PublishTask,
  SavedWorkspace,
  TaskStatus,
} from '../sau_frontend/src/types/studio'
import type {
  AccountInput,
  TaskCounts,
  TaskEvent,
  TaskPage,
  TaskQuery,
  TaskSummary,
} from '../shared/desktop'

export const taskQuerySchema = z.object({
  page: z.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
  query: z.string().max(200).default(''),
  status: z
    .enum([
      'all',
      'preview',
      'queued',
      'scheduled',
      'running',
      'submitted',
      'unknown',
      'cancelled',
      'failed',
      'missed',
    ])
    .default('all'),
  history: z.boolean().default(false),
})

const kind = z.enum(['video', 'note', 'article'])
const id = z.union([z.string().min(1).max(200), z.number().int()])
const material = z.object({
  id,
  name: z.string().max(500),
  kind,
  size: z.number().nonnegative(),
  url: z.string().optional(),
  duration: z.string().optional(),
  serverPath: z.string().optional(),
  createdAt: z.string().optional(),
  sample: z.boolean().optional(),
  body: z.string().max(5_000_000).optional(),
  localPath: z.string().optional(),
  modifiedAt: z.number().optional(),
})
const account = z.object({
  id,
  platformId: z.string().max(50),
  name: z.string().max(80),
  group: z.string().max(80),
  status: z.enum(['valid', 'expired', 'checking', 'unverified']),
  filePath: z.string().optional(),
  legacyType: z.number().optional(),
  message: z.string().optional(),
  avatarUrl: z.string().optional(),
})
const options = z.record(
  z.string(),
  z.union([z.string().max(10000), z.number().finite(), z.boolean()]),
)
export const composerSchema = z.object({
  kind,
  title: z.string().trim().min(1, '请填写标题。').max(100),
  description: z.string().max(10000),
  tags: z.array(z.string().max(100)).max(50),
  body: z.string().max(5_000_000),
  selectedAccountIds: z.array(id).min(1).max(100),
  assets: z.array(material).max(100),
  scheduleMode: z.enum(['now', 'later']),
  scheduledAt: z.string(),
  overrides: z.record(
    z.string(),
    z.object({
      title: z.string().max(100),
      description: z.string().max(10000),
    }),
  ),
  platformOptions: z.record(z.string(), options).optional(),
  articleBasePath: z.string().optional(),
})
// Drafts may be intentionally incomplete; task submission applies the stricter schema above.
const draftSchema = composerSchema.extend({
  title: z.string().max(100),
  selectedAccountIds: z.array(id).max(100),
  id: z.string(),
  mode: z.enum(['demo', 'live']),
  updatedAt: z.number(),
})
const workspaceSchema = z.object({
  mode: z.enum(['demo', 'live']),
  theme: z.enum(['dark', 'light']),
  sampleAccounts: z.array(account).max(1000),
  sampleMaterials: z.array(material).max(10000),
  drafts: z.array(draftSchema).max(10000),
  tasks: z.array(z.unknown()).max(10000),
})

export class StudioStore {
  readonly db: DatabaseSync
  constructor(readonly directory: string) {
    mkdirSync(directory, { recursive: true })
    this.db = new DatabaseSync(join(directory, 'studio.sqlite3'))
    const version = this.db.prepare('PRAGMA user_version').get() as {
      user_version: number
    }
    if (version.user_version > 1) {
      this.db.close()
      throw new Error('数据库由更新版本创建，请使用较新的 SAU Studio。')
    }
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS materials (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, status TEXT NOT NULL,
        armed INTEGER NOT NULL DEFAULT 0, run_at INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL,
        time INTEGER NOT NULL, level TEXT NOT NULL, message TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS tasks_queue ON tasks(status, armed, run_at);
      CREATE INDEX IF NOT EXISTS events_task ON events(task_id, id);
      PRAGMA user_version=1;`)
    const interrupted = this.db
      .prepare(
        "SELECT data FROM tasks WHERE status='running' OR (status IN ('queued','scheduled') AND armed=1 AND run_at>0 AND run_at<=?)",
      )
      .all(Date.now()) as { data: string }[]
    for (const { data } of interrupted) {
      const task = JSON.parse(data) as PublishTask
      if (task.status === 'running')
        this.updateTask(task.id, 'unknown', '上次执行被中断，请核验平台结果后再处理。')
      else if (
        ['queued', 'scheduled'].includes(task.status) &&
        task.armed &&
        task.scheduleMode === 'later' &&
        Date.parse(task.scheduledAt) <= Date.now()
      )
        this.updateTask(task.id, 'missed', '客户端未运行时错过执行时间，请重新安排；未自动补发。')
    }
    for (const item of this.accounts())
      if (item.status === 'checking')
        this.saveAccountData({
          ...item,
          status: 'unverified',
          message: '上次登录或检查被中断，请重新检查。',
        })
  }
  close() {
    this.db.close()
  }
  setting<T>(key: string): T | undefined {
    const row = this.db.prepare('SELECT value FROM settings WHERE key=?').get(key) as
      { value: string } | undefined
    return row ? (JSON.parse(row.value) as T) : undefined
  }
  setSetting(key: string, value: unknown) {
    this.db
      .prepare(
        'INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      )
      .run(key, JSON.stringify(value))
  }
  workspace(): SavedWorkspace | undefined {
    return this.setting('workspace')
  }
  saveWorkspace(raw: unknown) {
    const value = workspaceSchema.parse(raw)
    // Renderer-owned demo tasks cannot overwrite the persistent live queue.
    value.tasks = value.tasks.filter((task): task is object =>
      Boolean(task && typeof task === 'object' && (task as { mode?: string }).mode === 'demo'),
    )
    this.setSetting('workspace', value)
  }
  private rows<T>(table: 'accounts' | 'materials' | 'tasks'): T[] {
    return (
      this.db.prepare(`SELECT data FROM ${table} ORDER BY rowid DESC`).all() as { data: string }[]
    ).map((row) => JSON.parse(row.data) as T)
  }
  accounts(): Account[] {
    return this.rows('accounts')
  }
  materials(): Material[] {
    return this.rows('materials')
  }
  materialHeaders(): Material[] {
    return (
      this.db
        .prepare("SELECT json_remove(data,'$.body') AS data FROM materials ORDER BY rowid DESC")
        .all() as { data: string }[]
    ).map(({ data }) => JSON.parse(data) as Material)
  }
  materialByFile(path: string): Material | undefined {
    const row = this.db
      .prepare("SELECT data FROM materials WHERE json_extract(data,'$.localPath')=? LIMIT 1")
      .get(path) as { data: string } | undefined
    return row ? (JSON.parse(row.data) as Material) : undefined
  }
  tasks(): PublishTask[] {
    return this.rows('tasks')
  }
  taskCounts(): TaskCounts {
    return {
      ...(this.db
        .prepare(
          `SELECT count(*) AS total,
      coalesce(sum(status IN ('queued','scheduled','preview')),0) AS pending,
      coalesce(sum(status='running'),0) AS running FROM tasks`,
        )
        .get() as unknown as TaskCounts),
    }
  }
  private taskSelection(input: TaskQuery = {}, platformIds: string[] = []) {
    const query = taskQuerySchema.parse(input)
    const where: string[] = [],
      params: string[] = []
    if (query.history) where.push("status IN ('submitted','unknown','cancelled','failed','missed')")
    if (query.status !== 'all') {
      where.push('status=?')
      params.push(query.status)
    }
    if (query.query) {
      where.push(`(instr(lower(coalesce(json_extract(data,'$.title'),'') || coalesce(json_extract(data,'$.account.name'),'') || coalesce(json_extract(data,'$.account.platformId'),'')),lower(?))>0
        OR json_extract(data,'$.account.platformId') IN (SELECT value FROM json_each(?)))`)
      params.push(query.query, JSON.stringify(platformIds))
    }
    return {
      query,
      where: where.length ? ' WHERE ' + where.join(' AND ') : '',
      params,
    }
  }
  taskPage(input: TaskQuery = {}, platformIds: string[] = []): TaskPage {
    const { query, where, params } = this.taskSelection(input, platformIds)
    const { total } = this.db
      .prepare('SELECT count(*) AS total FROM tasks' + where)
      .get(...params) as { total: number }
    const page = Math.min(query.page, Math.max(1, Math.ceil(total / query.pageSize)))
    const items = (
      this.db
        .prepare(
          `SELECT json_remove(data,'$.body','$.description','$.tags','$.assets','$.platformOptions','$.articleBasePath') AS data
      FROM tasks${where} ORDER BY rowid DESC LIMIT ? OFFSET ?`,
        )
        .all(...params, query.pageSize, (page - 1) * query.pageSize) as {
        data: string
      }[]
    ).map(({ data }) => JSON.parse(data) as TaskSummary)
    return { items, total, page, pageSize: query.pageSize }
  }
  taskRows(input: TaskQuery = {}, platformIds: string[] = []) {
    const { where, params } = this.taskSelection(input, platformIds)
    return this.db
      .prepare('SELECT data FROM tasks' + where + ' ORDER BY rowid DESC')
      .iterate(...params) as IterableIterator<{ data: string }>
  }
  account(id: string): Account | undefined {
    return this.row('accounts', id)
  }
  material(id: string): Material | undefined {
    return this.row('materials', id)
  }
  private row<T>(table: 'accounts' | 'materials' | 'tasks', id: string): T | undefined {
    const row = this.db.prepare(`SELECT data FROM ${table} WHERE id=?`).get(id) as
      { data: string } | undefined
    return row ? (JSON.parse(row.data) as T) : undefined
  }
  queuedTasks(now = Date.now()): PublishTask[] {
    return (
      this.db
        .prepare(
          "SELECT data FROM tasks WHERE status IN ('queued','scheduled') AND armed=1 AND run_at<=? ORDER BY rowid",
        )
        .all(now) as { data: string }[]
    ).map((row) => JSON.parse(row.data) as PublishTask)
  }
  hasScheduledTasks(): boolean {
    return Boolean(
      this.db
        .prepare("SELECT 1 FROM tasks WHERE status IN ('queued','scheduled') AND armed=1 LIMIT 1")
        .get(),
    )
  }
  saveAccount(input: AccountInput): Account {
    const value = z
      .object({
        id: z.string().optional(),
        platformId: z.string().min(1).max(50),
        name: z.string().trim().min(1).max(40),
        group: z.string().max(40),
      })
      .parse(input)
    const existing = value.id ? this.account(value.id) : undefined
    if (value.id && !existing) throw new Error('账号不存在。')
    if (existing && existing.platformId !== value.platformId)
      throw new Error('不能修改已绑定账号的平台。')
    const result: Account = {
      id: existing?.id || randomUUID(),
      ...value,
      status: existing?.status || 'unverified',
      message: existing?.message,
      avatarUrl: existing?.avatarUrl,
    }
    if (!result.id) result.id = randomUUID()
    this.saveAccountData(result)
    return result
  }
  saveAccountData(value: Account) {
    this.db
      .prepare('INSERT INTO accounts VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data')
      .run(String(value.id), JSON.stringify(value))
  }
  removeAccount(id: string) {
    if (
      this.db
        .prepare(
          "SELECT 1 FROM tasks WHERE account_id=? AND status IN ('queued','scheduled','running') LIMIT 1",
        )
        .get(id)
    )
      throw new Error('该账号还有待执行或运行中的任务，请先处理任务。')
    this.db.prepare('DELETE FROM accounts WHERE id=?').run(id)
  }
  saveMaterial(value: Material) {
    this.db
      .prepare('INSERT INTO materials VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data')
      .run(String(value.id), JSON.stringify(value))
  }
  removeMaterial(id: string) {
    if (
      this.db
        .prepare(
          `SELECT 1 FROM tasks, json_each(tasks.data,'$.assets') AS asset
        WHERE status IN ('queued','scheduled','running') AND CAST(json_extract(asset.value,'$.id') AS TEXT)=? LIMIT 1`,
        )
        .get(id)
    )
      throw new Error('待执行任务正在使用该素材，请先取消任务。')
    this.db.prepare('DELETE FROM materials WHERE id=?').run(id)
  }
  insertTasks(tasks: PublishTask[]) {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const insert = this.db.prepare(
        'INSERT INTO tasks(id,account_id,status,armed,run_at,data) VALUES(?,?,?,?,?,?)',
      )
      for (const task of tasks)
        insert.run(
          task.id,
          String(task.account.id),
          task.status,
          0,
          task.scheduleMode === 'later' ? Date.parse(task.scheduledAt) : 0,
          JSON.stringify(task),
        )
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }
  task(id: string) {
    return this.row<PublishTask>('tasks', id)
  }
  updateTask(id: string, status: TaskStatus, message: string, armed?: boolean) {
    const task = this.task(id)
    if (!task) throw new Error('任务不存在。')
    Object.assign(task, { status, message }, armed === undefined ? {} : { armed })
    if (!['queued', 'scheduled', 'running'].includes(status)) task.finishedAt = Date.now()
    this.db
      .prepare('UPDATE tasks SET status=?,armed=?,data=? WHERE id=?')
      .run(status, task.armed ? 1 : 0, JSON.stringify(task), id)
    this.event(id, 'info', message)
    return task
  }
  event(taskId: string, level: string, message: string) {
    this.db
      .prepare('INSERT INTO events(task_id,time,level,message) VALUES(?,?,?,?)')
      .run(taskId, Date.now(), level, message.slice(0, 4000))
    // Keep the latest 2000 entries per task without unbounded log growth.
    this.db
      .prepare(
        'DELETE FROM events WHERE task_id=? AND id NOT IN (SELECT id FROM events WHERE task_id=? ORDER BY id DESC LIMIT 2000)',
      )
      .run(taskId, taskId)
  }
  events(taskId: string): TaskEvent[] {
    return this.db
      .prepare(
        'SELECT id,task_id AS taskId,time,level,message FROM events WHERE task_id=? ORDER BY id',
      )
      .all(taskId) as unknown as TaskEvent[]
  }
}
