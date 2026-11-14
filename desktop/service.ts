import { createHash, randomUUID } from 'node:crypto'
import {
  statSync,
  realpathSync,
  readFileSync,
  existsSync,
  readdirSync,
  copyFileSync,
  unlinkSync,
  mkdirSync,
  writeFileSync,
  renameSync,
} from 'node:fs'
import { basename, join, resolve, sep } from 'node:path'
import { open, rename, unlink } from 'node:fs/promises'
import { StudioStore, composerSchema, taskQuerySchema } from './store'
import {
  startWorker,
  type WorkerHandle,
  type WorkerRuntime,
  type WorkerRequest,
  type WorkerResult,
} from './worker'
import { platforms } from '../shared/platforms'
import type {
  Account,
  ComposerForm,
  ContentKind,
  Material,
  PublishTask,
  SavedWorkspace,
} from '../sau_frontend/src/types/studio'
import type { AccountInput, DesktopSnapshot, PlatformOption, TaskQuery } from '../shared/desktop'

const kindFor = (path: string): ContentKind => {
  if (/\.(md|markdown|txt|html?)$/i.test(path)) return 'article'
  if (/\.(png|jpe?g|webp|gif)$/i.test(path)) return 'note'
  if (/\.(mp4|mov|mkv|webm|avi|m4v)$/i.test(path)) return 'video'
  throw new Error('请选择视频、图片或文章文件。')
}
type RunWorker = typeof startWorker
export class StudioService {
  private active = new Map<string, WorkerHandle>()
  private waiting = new Map<string, { start(): void; reject(error: Error): void }>()
  private operations = new Set<Promise<WorkerResult>>()
  private interruptions = new Map<string, Promise<void>>()
  private interrupted = new Set<string>()
  private busyAccounts = new Set<string>()
  private optionCache = new Map<string, PlatformOption[]>()
  private optionRequests = new Map<string, Promise<PlatformOption[]>>()
  private optionQueue: Promise<unknown> = Promise.resolve()
  private stopping = false
  private timer: ReturnType<typeof setInterval>
  constructor(
    readonly store: StudioStore,
    readonly runtime: WorkerRuntime,
    readonly version: string,
    private changed: () => void = () => {},
    private runWorker: RunWorker = startWorker,
  ) {
    this.timer = setInterval(() => this.pump(), 1000)
    this.timer.unref()
  }
  get maxWorkers(): 1 | 2 {
    return this.store.setting<number>('maxWorkers') === 1 ? 1 : 2
  }
  setMaxWorkers(value: unknown) {
    if (value !== 1 && value !== 2) throw new Error('并发数只能是 1 或 2。')
    this.store.setSetting('maxWorkers', value)
    this.drainWorkers()
    this.changed()
    this.pump()
  }
  private drainWorkers() {
    while (!this.stopping && this.active.size < this.maxWorkers && this.waiting.size) {
      const [id, job] = this.waiting.entries().next().value!
      this.waiting.delete(id)
      job.start()
    }
  }
  private managedWorker(
    id: string,
    request: WorkerRequest,
    onLog: (message: string) => void,
  ): WorkerHandle {
    let actual: WorkerHandle | undefined
    let rejectWaiting!: (error: Error) => void
    const operation = new Promise<WorkerResult>((resolve, reject) => {
      rejectWaiting = reject
      this.waiting.set(id, {
        reject,
        start: () => {
          try {
            actual = this.runWorker(this.runtime, this.store.directory, request, onLog)
            this.active.set(id, actual)
            void actual.result.then(resolve, reject)
          } catch (error) {
            reject(error)
          }
        },
      })
    })
    const result = operation.finally(() => {
      this.waiting.delete(id)
      this.active.delete(id)
      this.operations.delete(result)
      this.drainWorkers()
    })
    this.operations.add(result)
    if (this.stopping) rejectWaiting(new Error('客户端正在退出。'))
    else this.drainWorkers()
    return {
      result,
      stop: async () => {
        if (actual) await actual.stop()
        else {
          this.waiting.delete(id)
          rejectWaiting(new Error('操作已取消。'))
          await result.catch(() => {})
        }
      },
    }
  }
  snapshot(includeWorkspace = true): DesktopSnapshot {
    return {
      workspace: includeWorkspace ? this.store.workspace() : undefined,
      accounts: this.store.accounts(),
      materials: this.store.materialHeaders(),
      tasks: this.store.taskPage().items,
      taskCounts: this.store.taskCounts(),
      info: {
        version: this.version,
        dataDirectory: this.store.directory,
        workerReady: this.runtime.ready,
        workerMessage: this.runtime.message,
        maxWorkers: this.maxWorkers,
      },
    }
  }
  private matchingPlatforms(query: TaskQuery = {}) {
    return platforms
      .filter((item) => query.query && item.name.toLowerCase().includes(query.query.toLowerCase()))
      .map((item) => item.id)
  }
  taskPage(query: TaskQuery = {}) {
    query = taskQuerySchema.parse(query)
    return this.store.taskPage(query, this.matchingPlatforms(query))
  }
  async exportContent(path: string, scope: 'tasks' | 'workspace', query: TaskQuery = {}) {
    query = taskQuerySchema.parse(query)
    const temporary = path + '.' + randomUUID() + '.tmp'
    const file = await open(temporary, 'wx')
    try {
      if (scope === 'workspace') {
        const header = {
          version: 1,
          mode: 'live',
          exportedAt: new Date().toISOString(),
          drafts: this.store.workspace()?.drafts.filter((draft) => draft.mode === 'live') || [],
        }
        await file.write(JSON.stringify(header).slice(0, -1) + ',"tasks":')
      }
      await file.write('[')
      let first = true
      for (const { data } of this.store.taskRows(query, this.matchingPlatforms(query))) {
        await file.write((first ? '\n' : ',\n') + data)
        first = false
      }
      await file.write('\n]' + (scope === 'workspace' ? '}' : ''))
      await file.close()
      await rename(temporary, path)
    } finally {
      await file.close().catch(() => {})
      await unlink(temporary).catch(() => {})
    }
  }
  saveWorkspace(workspace: SavedWorkspace) {
    this.store.saveWorkspace(workspace)
  }
  saveAccount(input: AccountInput) {
    if (!platforms.some((item) => item.id === input.platformId)) throw new Error('不支持的平台。')
    const account = this.store.saveAccount(input)
    this.changed()
    return account
  }
  async accountAction(id: string, action: 'login' | 'check') {
    if (action !== 'login' && action !== 'check') throw new Error('不支持的账号操作。')
    const account = this.store.account(id)
    if (!account) throw new Error('账号不存在。')
    if (this.busyAccounts.has(id)) throw new Error('该账号正在执行其他操作，请等待完成。')
    const previous = account.status
    this.busyAccounts.add(id)
    try {
      const handle = this.managedWorker(
        'account:' + id,
        { platform: account.platformId, action, account: id },
        () => {},
      )
      this.store.saveAccountData({
        ...account,
        status: 'checking',
        message:
          action === 'login'
            ? '正在排队或等待平台登录，请在浏览器中完成验证。'
            : '正在排队检查账号。',
      })
      this.changed()
      const result = await handle.result
      let avatarUrl = this.store.account(id)?.avatarUrl
      if (result.ok && result.avatar) {
        try {
          // Keep image bytes out of account/task snapshots and cache CDN-independent PNGs.
          if (result.avatar.length > 100_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(result.avatar))
            throw new Error('Invalid avatar payload')
          const image = Buffer.from(result.avatar, 'base64')
          if (
            image.length < 24 ||
            !image.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ||
            image.readUInt32BE(16) !== 128 ||
            image.readUInt32BE(20) !== 128
          )
            throw new Error('Invalid avatar image')
          const folder = join(this.store.directory, 'avatars')
          mkdirSync(folder, { recursive: true })
          const path = join(folder, id + '.png')
          writeFileSync(path + '.tmp', image)
          renameSync(path + '.tmp', path)
          avatarUrl =
            'sau-media://avatar/' +
            id +
            '?v=' +
            createHash('sha256').update(image).digest('hex').slice(0, 16)
        } catch {
          // Preserve the last avatar if optional image capture or caching fails.
        }
      }
      this.store.saveAccountData({
        ...(this.store.account(id) || account),
        avatarUrl,
        status: result.ok
          ? 'valid'
          : action === 'check'
            ? 'expired'
            : previous === 'valid'
              ? 'unverified'
              : previous,
        message: result.message,
      })
    } catch (error) {
      this.store.saveAccountData({
        ...(this.store.account(id) || account),
        status: previous,
        message: error instanceof Error ? error.message : '登录未完成。',
      })
      throw error
    } finally {
      this.busyAccounts.delete(id)
      this.changed()
    }
  }
  removeAccount(id: string) {
    if (this.busyAccounts.has(id)) throw new Error('该账号正在执行操作。')
    this.store.removeAccount(id)
    for (const suffix of ['.png', '.png.tmp']) {
      const avatar = join(this.store.directory, 'avatars', id + suffix)
      if (existsSync(avatar)) unlinkSync(avatar)
    }
    this.changed()
    const cookies = join(this.store.directory, 'cookies')
    if (existsSync(cookies))
      for (const name of readdirSync(cookies)) {
        if (name.endsWith('_' + id + '.json')) unlinkSync(join(cookies, name))
      }
  }
  importAccounts(directory: string): number {
    const cookieDirectory = resolve(directory, 'cookies')
    if (!existsSync(cookieDirectory))
      throw new Error('所选目录中没有 cookies 文件夹，请选择原项目根目录。')
    let count = 0
    for (const file of readdirSync(cookieDirectory)) {
      const platform = [...platforms]
        .sort((a, b) => b.id.length - a.id.length)
        .find((item) => file.startsWith(item.id + '_') && file.endsWith('.json'))
      if (!platform) continue
      const source = realpathSync(join(cookieDirectory, file))
      if (
        !source.startsWith(realpathSync(cookieDirectory) + sep) ||
        !statSync(source).isFile() ||
        statSync(source).size > 10 * 1024 * 1024
      )
        continue
      const data: unknown = JSON.parse(readFileSync(source, 'utf8'))
      if (!data || typeof data !== 'object' || (!('cookies' in data) && !('cookie_info' in data)))
        continue
      const imported = this.store.setting<Record<string, string>>('importedSessionBindings') || {}
      if (imported[source] && this.store.accounts().some((item) => item.id === imported[source]))
        continue
      const account = this.store.saveAccount({
        platformId: platform.id,
        name: file.slice(platform.id.length + 1, -5).slice(0, 40) || platform.name,
        group: '从原项目导入',
      })
      const destination = join(this.store.directory, 'cookies')
      const { mkdirSync } = require('node:fs') as typeof import('node:fs')
      mkdirSync(destination, { recursive: true })
      copyFileSync(source, join(destination, platform.id + '_' + account.id + '.json'))
      this.store.setSetting('importedSessionBindings', {
        ...imported,
        [source]: String(account.id),
      })
      count++
    }
    this.changed()
    return count
  }
  importFile(path: string): Material {
    const source = realpathSync(path),
      stat = statSync(source)
    if (!stat.isFile()) throw new Error('请选择一个有效文件。')
    const kind = kindFor(source)
    if (kind === 'article' && stat.size > 5 * 1024 * 1024)
      throw new Error('文章文件需要小于 5 MB。')
    const existing = this.store.materialByFile(source)
    if (existing && existing.modifiedAt === stat.mtimeMs && existing.size === stat.size)
      return existing
    const id = randomUUID()
    const asset: Material = {
      id,
      name: basename(source),
      kind,
      size: stat.size,
      localPath: source,
      modifiedAt: stat.mtimeMs,
      createdAt: new Date().toISOString(),
      url: kind === 'article' ? undefined : 'sau-media://asset/' + id,
      body: kind === 'article' ? readFileSync(source, 'utf8').replace(/^\uFEFF/, '') : undefined,
    }
    this.store.saveMaterial(asset)
    this.changed()
    return asset
  }
  removeMaterial(id: string) {
    this.store.removeMaterial(id)
    this.changed()
  }
  approveOptionFile(path: string) {
    const source = realpathSync(path)
    if (!statSync(source).isFile()) throw new Error('文件不存在。')
    const approved = this.store.setting<string[]>('approvedFiles') || []
    if (!approved.includes(source)) this.store.setSetting('approvedFiles', [...approved, source])
    return source
  }
  async options(platformId: string, kind: ContentKind): Promise<PlatformOption[]> {
    if (!platforms.some((item) => item.id === platformId && item.kinds.includes(kind)))
      throw new Error('该平台不支持此内容类型。')
    const key = platformId + ':' + kind
    const prepared = this.runtime.schemas?.[key]
    if (prepared) return prepared
    const cached = this.optionCache.get(key)
    if (cached) return cached
    const pending = this.optionRequests.get(key)
    if (pending) return pending
    const request = this.optionQueue.then(() => {
      if (this.stopping) throw new Error('客户端正在退出。')
      return this.loadOptions(platformId, kind, key)
    })
    // Platform selection can request many schemas at once; load one Python runtime at a time.
    this.optionQueue = request.catch(() => {})
    this.optionRequests.set(key, request)
    try {
      return await request
    } finally {
      this.optionRequests.delete(key)
    }
  }
  private async loadOptions(
    platformId: string,
    kind: ContentKind,
    key: string,
  ): Promise<PlatformOption[]> {
    const operation = 'schema:' + randomUUID()
    const handle = this.managedWorker(
      operation,
      { platform: platformId, action: 'schema', kind },
      () => {},
    )
    const result = await handle.result
    if (!result.ok || !result.options) throw new Error(result.message)
    this.optionCache.set(key, result.options)
    return result.options
  }
  private resolveAssets(form: ComposerForm): Material[] {
    if (form.kind === 'article') {
      if (!form.body.trim()) throw new Error('请填写文章正文。')
      return []
    }
    if (!form.assets.length || (form.kind === 'video' && form.assets.length !== 1))
      throw new Error('视频任务需要一个视频，图文任务需要至少一张图片。')
    return form.assets.map((item) => {
      const asset = this.store.material(String(item.id))
      if (!asset || asset.kind !== form.kind || !asset.localPath || asset.sample)
        throw new Error('请重新导入本机素材。')
      const stat = statSync(asset.localPath)
      if (!stat.isFile() || stat.size !== asset.size || stat.mtimeMs !== asset.modifiedAt)
        throw new Error('素材已移动或发生变化，请重新导入：' + asset.name)
      return asset
    })
  }
  async enqueue(raw: ComposerForm) {
    const form = composerSchema.parse(raw)
    if (form.kind === 'article' && (form.description.trim() || form.tags.length))
      throw new Error('文章正文之外的描述和标签无法单独提交，请将这些内容整理进正文。')
    const assets = this.resolveAssets(form)
    if (new Set(form.selectedAccountIds).size !== form.selectedAccountIds.length)
      throw new Error('发布账号不能重复。')
    if (form.scheduleMode === 'later') {
      const time = Date.parse(form.scheduledAt)
      if (!Number.isFinite(time) || time <= Date.now()) throw new Error('请选择未来的执行时间。')
      // Persist an explicit instant so Windows timezone changes cannot alter the schedule.
      form.scheduledAt = new Date(time).toISOString()
    }
    const batchId = randomUUID(),
      entries: PublishTask[] = []
    for (const id of form.selectedAccountIds) {
      const account = this.store.account(String(id))
      const platform = platforms.find((item) => item.id === account?.platformId)
      if (!account || account.status !== 'valid' || !platform?.kinds.includes(form.kind))
        throw new Error('账号未验证或不支持该内容。')
      const schema = await this.options(platform.id, form.kind)
      const input = form.platformOptions?.[platform.id] || {},
        values: Record<string, string | number | boolean> = {}
      for (const key of Object.keys(input))
        if (!schema.some((option) => option.key === key))
          throw new Error('平台选项已变化，请重新打开平台设置。')
      for (const option of schema) {
        const value = input[option.key] ?? option.default
        if (option.required && (value === undefined || value === ''))
          throw new Error(platform.name + '：请填写' + option.label)
        if (value === undefined || value === '') continue
        if (option.choices && !option.choices.includes(String(value)))
          throw new Error('平台选项不合法：' + option.label)
        if (option.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value)))
          throw new Error('请输入数字：' + option.label)
        if (option.type === 'boolean' && typeof value !== 'boolean')
          throw new Error('选项类型不正确。')
        if (option.type === 'file') {
          const path = realpathSync(String(value))
          if (
            !(this.store.setting<string[]>('approvedFiles') || []).includes(path) &&
            !this.store.materialByFile(path)
          )
            throw new Error('请通过选择文件按钮指定' + option.label)
          if (!statSync(path).isFile()) throw new Error('文件不存在：' + option.label)
        }
        values[option.key] = value
      }
      let articleBasePath: string | undefined
      if (form.articleBasePath) {
        const article = this.store.materialByFile(form.articleBasePath)
        if (!article || article.kind !== 'article') throw new Error('请重新导入文章源文件。')
        articleBasePath = article.localPath
      }
      entries.push({
        id: randomUUID(),
        batchId,
        mode: 'live',
        kind: form.kind,
        account,
        title: form.overrides[String(id)]?.title.trim() || form.title,
        description: form.overrides[String(id)]?.description.trim() || form.description,
        body: form.body,
        tags: form.tags,
        assets,
        scheduleMode: form.scheduleMode,
        scheduledAt: form.scheduledAt,
        status: 'queued',
        createdAt: Date.now(),
        message: '等待手动开始。',
        platformOptions: values,
        articleBasePath,
        armed: false,
      })
    }
    this.store.insertTasks(entries)
    this.changed()
    return entries.length
  }
  startTask(id: string) {
    const task = this.store.task(id)
    if (!task || task.status !== 'queued' || task.armed) throw new Error('任务不能重复开始。')
    if (!this.runtime.ready) throw new Error(this.runtime.message)
    if (task.scheduleMode === 'later' && Date.parse(task.scheduledAt) <= Date.now()) {
      this.store.updateTask(id, 'missed', '已错过执行时间，请重新安排。')
      this.changed()
      return
    }
    this.store.updateTask(
      id,
      task.scheduleMode === 'later' ? 'scheduled' : 'queued',
      task.scheduleMode === 'later' ? '已启用本地定时，请保持电脑和客户端运行。' : '等待队列调度。',
      true,
    )
    this.changed()
    this.pump()
  }
  cancelTask(id: string) {
    const task = this.store.task(id)
    if (!task || !['queued', 'scheduled'].includes(task.status))
      throw new Error('只能取消尚未运行的任务。')
    this.store.updateTask(id, 'cancelled', '已取消，未调用上传进程。', false)
    this.changed()
  }
  interruptTask(id: string): Promise<void> {
    const pending = this.interruptions.get(id)
    if (pending) return pending
    const task = this.store.task(id)
    const worker = this.active.get(id)
    if (task?.status !== 'running' || !worker) throw new Error('该任务当前没有运行中的上传进程。')
    this.interrupted.add(id)
    this.store.event(id, 'warning', '用户请求中断当前任务，正在停止本地上传进程。')
    const operation = Promise.resolve()
      .then(() => worker.stop())
      .then(() => {
        this.store.updateTask(
          id,
          'unknown',
          '已中断本地上传进程。平台可能已经接收部分或全部内容，请到创作者中心核验后再决定是否重发。',
          false,
        )
      })
      .catch((error: unknown) => {
        this.interrupted.delete(id)
        const message = error instanceof Error ? error.message : '未能确认上传进程已经停止。'
        if (this.store.task(id)?.status === 'running')
          this.store.updateTask(id, 'running', '中断未完成：' + message)
        throw new Error('中断未完成：' + message)
      })
      .finally(() => {
        this.interruptions.delete(id)
        this.changed()
      })
    this.interruptions.set(id, operation)
    this.changed()
    return operation
  }
  submitVerification(id: string, code: string) {
    const task = this.store.task(id)
    const worker = this.active.get(id)
    if (task?.status !== 'running' || !worker?.verification)
      throw new Error('该任务当前没有运行中的上传进程。')
    worker.verification(code)
    this.store.event(id, 'info', '已向该任务提交验证码，验证码内容未写入日志。')
    this.changed()
  }
  private pump() {
    if (this.stopping) return
    if (this.active.size + this.waiting.size >= this.maxWorkers) return
    for (const task of this.store.queuedTasks()) {
      if (this.active.size + this.waiting.size >= this.maxWorkers) break
      if (
        !task.armed ||
        !['queued', 'scheduled'].includes(task.status) ||
        this.busyAccounts.has(String(task.account.id))
      )
        continue
      if (task.scheduleMode === 'later') {
        const due = Date.parse(task.scheduledAt)
        if (due > Date.now()) continue
        if (Date.now() - due > 60_000) {
          this.store.updateTask(
            task.id,
            'missed',
            '已错过本地执行时间，请重新安排；未自动补发。',
            false,
          )
          this.changed()
          continue
        }
      }
      void this.execute(task)
    }
  }
  private async execute(task: PublishTask) {
    const accountId = String(task.account.id)
    this.busyAccounts.add(accountId)
    try {
      const account = this.store.account(accountId)
      if (account?.status !== 'valid') throw new Error('账号状态已变化，请先重新验证。')
      this.resolveAssets({
        ...task,
        selectedAccountIds: [accountId],
        overrides: {},
      } as ComposerForm)
      this.store.updateTask(task.id, 'running', '上传进程正在执行，请在需要时完成浏览器内验证。')
      this.changed()
      const handle = this.managedWorker(
        task.id,
        {
          platform: task.account.platformId,
          action: 'publish',
          account: accountId,
          task,
        },
        (message) => {
          this.store.event(task.id, 'worker', message)
        },
      )
      const result = await handle.result
      // Keep the account locked until the entire process tree has stopped.
      await this.interruptions.get(task.id)?.catch(() => {})
      if (this.interrupted.has(task.id)) return
      this.store.updateTask(
        task.id,
        result.ok ? 'submitted' : 'unknown',
        result.ok
          ? '上传核心已返回提交完成；是否审核通过或公开仍需核验。'
          : result.message + ' 请核验平台，未自动重试。',
        false,
      )
    } catch (error) {
      await this.interruptions.get(task.id)?.catch(() => {})
      if (this.interrupted.has(task.id)) return
      const started = this.store.task(task.id)?.status === 'running'
      this.store.updateTask(
        task.id,
        started ? 'unknown' : 'failed',
        error instanceof Error ? error.message : '任务未完成。',
        false,
      )
    } finally {
      this.interrupted.delete(task.id)
      this.busyAccounts.delete(accountId)
      this.changed()
    }
  }
  get running() {
    return this.active.size > 0 || this.waiting.size > 0
  }
  get scheduled() {
    return this.store.hasScheduledTasks()
  }
  async stop() {
    this.stopping = true
    clearInterval(this.timer)
    for (const job of this.waiting.values()) job.reject(new Error('客户端正在退出。'))
    this.waiting.clear()
    await Promise.allSettled([...this.active.values()].map((handle) => handle.stop()))
    await Promise.allSettled([...this.operations])
    await Promise.allSettled([...this.interruptions.values()])
  }
}
