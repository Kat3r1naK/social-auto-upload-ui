import { defineStore } from 'pinia'
import { computed, nextTick, onScopeDispose, ref, watch } from 'vue'
import type { DesktopInfo, TaskCounts, TaskSummary } from '../../../shared/desktop'
import { http } from '@/utils/request'
import { getPlatform, mountainImage } from '@/config/platforms'
import type {
  Account,
  ComposerForm,
  ContentKind,
  Draft,
  LegacyAccountRow,
  LegacyMaterial,
  Material,
  PublishTask,
  SavedWorkspace,
  WorkspaceMode,
} from '@/types/studio'
const KEY = 'sau-studio-v1'
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const uid = () => crypto.randomUUID()
let saved: Partial<SavedWorkspace> = {}
try {
  const parsed: unknown = JSON.parse(window.sauDesktop ? '{}' : localStorage.getItem(KEY) || '{}')
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
    saved = parsed as Partial<SavedWorkspace>
} catch {
  /* Invalid workspace data starts empty. */
}
const demoAccounts: Account[] = [
  {
    id: 'sample-douyin',
    platformId: 'douyin',
    name: '山野日记',
    group: '个人创作',
    status: 'valid',
  },
  {
    id: 'sample-xhs',
    platformId: 'xiaohongshu',
    name: '山野日记',
    group: '个人创作',
    status: 'valid',
  },
  {
    id: 'sample-youtube',
    platformId: 'youtube',
    name: 'Weekend Notes',
    group: '海外频道',
    status: 'valid',
  },
]
export function createComposer(kind: ContentKind = 'video', demo = true): ComposerForm {
  return {
    kind,
    title: demo ? '把周末交给山野' : '',
    description: demo ? '记录一次近郊徒步，和沿途的小风景。' : '',
    tags: demo ? ['户外', '周末记录'] : [],
    body: demo
      ? '# 把周末交给山野\n\n记录一次近郊徒步，和沿途的小风景。\n\n## 出发之前\n\n带上水、相机和一颗慢下来的心。'
      : '',
    selectedAccountIds: demo
      ? kind === 'article'
        ? []
        : demoAccounts
            .map((item) => item.id)
            .filter((id) => kind === 'video' || id !== 'sample-youtube')
      : [],
    assets:
      demo && kind !== 'article'
        ? [
            {
              id: kind === 'note' ? 'sample-photo' : 'sample-video',
              name: kind === 'note' ? '山野周末.jpg' : '山野周末.mp4',
              kind,
              size: kind === 'note' ? 2480000 : 128 * 1024 * 1024,
              duration: kind === 'video' ? '02:18' : undefined,
              url: mountainImage,
              sample: true,
            },
          ]
        : [],
    scheduleMode: 'now',
    scheduledAt: '',
    overrides: {},
  }
}
export const useStudioStore = defineStore('studio', () => {
  const desktop = Boolean(window.sauDesktop)
  const desktopInfo = ref<DesktopInfo>()
  let desktopReady = false
  let persistChain = Promise.resolve()
  let refreshing: Promise<void> | undefined
  let refreshRequested = false
  let unsubscribe: (() => void) | undefined
  let unsubscribeSuspend: (() => void) | undefined
  const suspendHandlers = new Set<() => void | Promise<void>>()
  const revision = ref(0)
  const desktopTasks = ref<TaskSummary[]>([])
  const taskCounts = ref<TaskCounts>()
  onScopeDispose(() => {
    unsubscribe?.()
    unsubscribeSuspend?.()
  })
  function onBeforeSuspend(callback: () => void | Promise<void>) {
    suspendHandlers.add(callback)
    return () => suspendHandlers.delete(callback)
  }
  async function flushWorkspace() {
    await nextTick()
    await persistChain
    if (storageError.value) throw new Error(storageError.value)
  }
  const mode = ref<WorkspaceMode>(desktop || saved.mode === 'live' ? 'live' : 'demo')
  const theme = ref<'dark' | 'light'>(saved.theme === 'light' ? 'light' : 'dark')
  const storageError = ref('')
  const loading = ref(false)
  const connection = ref<'idle' | 'connected' | 'offline'>('idle')
  const connectionError = ref('')
  const liveAccounts = ref<Account[]>([])
  const liveMaterials = ref<Material[]>([])
  const sampleAccounts = ref<Account[]>(saved.sampleAccounts || copy(demoAccounts))
  const sampleMaterials = ref<Material[]>(
    saved.sampleMaterials || [
      {
        id: 'sample-video',
        name: '山野周末.mp4',
        kind: 'video',
        size: 128 * 1024 * 1024,
        duration: '02:18',
        url: mountainImage,
        sample: true,
      },
      {
        id: 'sample-photo',
        name: '山间清晨.jpg',
        kind: 'note',
        size: 2480000,
        url: mountainImage,
        sample: true,
      },
      {
        id: 'sample-article',
        name: '周末徒步手记.md',
        kind: 'article',
        size: 2400,
        body: createComposer('article').body,
        sample: true,
      },
    ],
  )
  const drafts = ref<Draft[]>(Array.isArray(saved.drafts) ? saved.drafts : [])
  const tasks = ref<PublishTask[]>(
    (Array.isArray(saved.tasks) ? saved.tasks : []).map((task) =>
      task.status === 'running'
        ? { ...task, status: 'unknown', message: '执行时工作区已关闭，请先核验平台结果。' }
        : task,
    ),
  )
  const accounts = computed(() =>
    mode.value === 'demo' ? sampleAccounts.value : liveAccounts.value,
  )
  const materials = computed(() =>
    mode.value === 'demo' ? sampleMaterials.value : liveMaterials.value,
  )
  const currentDrafts = computed(() => drafts.value.filter((item) => item.mode === mode.value))
  const currentTasks = computed(() =>
    desktop ? desktopTasks.value : tasks.value.filter((item) => item.mode === mode.value),
  )
  const pendingTasks = computed(() =>
    currentTasks.value.filter((item) => ['queued', 'scheduled', 'preview'].includes(item.status)),
  )
  const pendingTaskCount = computed(() =>
    desktop && taskCounts.value ? taskCounts.value.pending : pendingTasks.value.length,
  )
  const busy = computed(() =>
    desktop && taskCounts.value
      ? taskCounts.value.running > 0
      : currentTasks.value.some((item) => item.status === 'running'),
  )
  watch(
    // Live tasks belong to the main-process queue, not renderer-owned settings.
    desktop
      ? [mode, theme, sampleAccounts, sampleMaterials, drafts]
      : [mode, theme, sampleAccounts, sampleMaterials, drafts, tasks],
    () => {
      try {
        if (desktop && !desktopReady) return
        const serialized = JSON.stringify(
          {
            mode: mode.value,
            theme: theme.value,
            sampleAccounts: sampleAccounts.value,
            sampleMaterials: sampleMaterials.value,
            drafts: drafts.value,
            tasks: desktop ? tasks.value.filter((task) => task.mode === 'demo') : tasks.value,
          },
          (key, value) =>
            key === 'file' ||
            (key === 'url' && typeof value === 'string' && value.startsWith('blob:'))
              ? undefined
              : value,
        )
        if (desktop) {
          const workspace = JSON.parse(serialized) as SavedWorkspace
          persistChain = persistChain
            .then(() => window.sauDesktop!.saveWorkspace(workspace))
            .then(() => {
              storageError.value = ''
            })
            .catch((error) => {
              storageError.value = '本机数据库保存失败：' + String(error)
            })
        } else localStorage.setItem(KEY, serialized)
        storageError.value = ''
      } catch {
        storageError.value = '工作区存储空间不足，请导出草稿后清理浏览器存储。'
      }
    },
    { deep: true },
  )
  async function initializeDesktop() {
    if (!window.sauDesktop || desktopReady) return
    try {
      const snapshot = await window.sauDesktop.snapshot()
      if (snapshot.workspace) {
        const workspace = snapshot.workspace
        // Installed clients always use real local data, including upgrades from demo defaults.
        mode.value = 'live'
        theme.value = workspace.theme
        sampleAccounts.value = workspace.sampleAccounts
        sampleMaterials.value = workspace.sampleMaterials
        drafts.value = workspace.drafts
        tasks.value = workspace.tasks.filter((task) => task.mode === 'demo')
      }
      desktopTasks.value = snapshot.tasks
      taskCounts.value = snapshot.taskCounts
      liveAccounts.value = snapshot.accounts
      liveMaterials.value = snapshot.materials
      desktopInfo.value = snapshot.info
      connection.value = 'connected'
      await nextTick()
      desktopReady = true
      await window.sauDesktop.saveWorkspace(
        copy({
          mode: mode.value,
          theme: theme.value,
          sampleAccounts: sampleAccounts.value,
          sampleMaterials: sampleMaterials.value,
          drafts: drafts.value,
          tasks: tasks.value.filter((task) => task.mode === 'demo'),
        }),
      )
      unsubscribe = window.sauDesktop.onChanged(() => {
        void refreshDesktop().catch(() => {})
      })
      unsubscribeSuspend = window.sauDesktop.onPrepareSuspend?.(async () => {
        if (!desktopReady) throw new Error('工作区尚未就绪。')
        for (const callback of suspendHandlers) await callback()
        await flushWorkspace()
      })
    } catch (error) {
      storageError.value = '无法读取本机数据库：' + String(error)
    }
  }
  function refreshDesktop(): Promise<void> {
    refreshRequested = true
    if (refreshing) return refreshing
    refreshing = (async () => {
      loading.value = true
      connectionError.value = ''
      try {
        do {
          refreshRequested = false
          const snapshot = await window.sauDesktop!.snapshot(false)
          liveAccounts.value = snapshot.accounts
          liveMaterials.value = snapshot.materials
          desktopTasks.value = snapshot.tasks
          taskCounts.value = snapshot.taskCounts
          revision.value++
          desktopInfo.value = snapshot.info
          connection.value = 'connected'
        } while (refreshRequested)
      } catch (error) {
        connection.value = 'offline'
        connectionError.value = '无法读取本机数据：' + String(error)
        throw error
      } finally {
        loading.value = false
        refreshing = undefined
      }
    })()
    return refreshing
  }
  watch(
    theme,
    (value) => {
      document.documentElement.dataset.theme = value
      document.documentElement.style.colorScheme = value
    },
    { immediate: true },
  )
  function normalizeAccount(row: LegacyAccountRow): Account {
    const platform = [null, 'xiaohongshu', 'tencent', 'douyin', 'kuaishou'][row[1]]
    return {
      id: row[0],
      platformId: platform || 'unknown',
      name: row[3],
      filePath: row[2],
      legacyType: row[1],
      status: row[4] === 1 ? 'valid' : row[4] === -1 ? 'checking' : 'expired',
      group: '',
    }
  }
  async function refreshData() {
    if (desktop) {
      await refreshDesktop()
      return
    }
    if (mode.value === 'demo') return
    loading.value = true
    connectionError.value = ''
    const responses = await Promise.allSettled([
      http.get<LegacyAccountRow[]>('/getAccounts', undefined, { silent: true, timeout: 8000 }),
      http.get<LegacyMaterial[]>('/getFiles', undefined, { silent: true, timeout: 8000 }),
    ])
    if (responses[0].status === 'fulfilled')
      liveAccounts.value = (responses[0].value.data || []).map(normalizeAccount)
    if (responses[1].status === 'fulfilled')
      liveMaterials.value = (responses[1].value.data || []).map((item) => ({
        id: item.id,
        name: item.filename,
        size: item.filesize * 1024 * 1024,
        serverPath: item.file_path,
        kind: /\.(png|jpe?g|webp|gif)$/i.test(item.filename)
          ? 'note'
          : /\.(md|txt|html?)$/i.test(item.filename)
            ? 'article'
            : 'video',
        url:
          (import.meta.env.VITE_API_BASE_URL || '/api') +
          '/getFile?filename=' +
          encodeURIComponent(item.file_path),
        createdAt: item.upload_time,
      }))
    connection.value = responses.every((result) => result.status === 'fulfilled')
      ? 'connected'
      : 'offline'
    if (connection.value === 'offline')
      connectionError.value = '本地服务尚未连接，暂时无法读取账号与素材。你仍可编辑和保存草稿。'
    loading.value = false
  }
  function setMode(value: WorkspaceMode) {
    if (desktop && value !== 'live') throw new Error('桌面客户端使用本机工作区。')
    if (busy.value) throw new Error('请等待当前任务结束后切换工作区。')
    mode.value = value
    if (value === 'live') refreshData()
  }
  function saveDraft(form: ComposerForm, existingId?: string) {
    const draft = {
      ...copy(form),
      id: existingId || uid(),
      mode: mode.value,
      updatedAt: Date.now(),
    }
    const index = drafts.value.findIndex((item) => item.id === draft.id)
    if (index < 0) drafts.value.unshift(draft)
    else drafts.value[index] = draft
    return draft.id
  }
  async function addTasks(form: ComposerForm) {
    if (desktop && mode.value === 'live') {
      const count = await window.sauDesktop!.enqueue(copy(form))
      await refreshDesktop()
      return count
    }
    if (!form.title.trim()) throw new Error('请先填写标题。')
    if (form.kind === 'article' ? !form.body.trim() : !form.assets.length)
      throw new Error(form.kind === 'article' ? '请先填写文章正文。' : '请先选择素材。')
    if (!form.selectedAccountIds.length) throw new Error('请至少选择一个发布账号。')
    const targets = form.selectedAccountIds
      .map((id) => accounts.value.find((account) => account.id === id))
      .filter((account): account is Account => Boolean(account))
    if (
      targets.length !== form.selectedAccountIds.length ||
      targets.some(
        (account) =>
          account.status !== 'valid' || !getPlatform(account.platformId)?.kinds.includes(form.kind),
      )
    )
      throw new Error('所选账号中有已失效或不支持该内容类型的账号，请重新选择。')
    if (
      form.scheduleMode === 'later' &&
      (!form.scheduledAt || new Date(form.scheduledAt).getTime() <= Date.now())
    )
      throw new Error('请选择未来的发布时间。')
    if (mode.value === 'live') {
      if (form.kind !== 'video' || targets.some((account) => !account.legacyType))
        throw new Error('这个内容类型或平台正在等待新版发布服务接入。草稿可以先保存。')
      if (
        form.description.trim() ||
        Object.values(form.overrides).some((override) => override.description.trim())
      )
        throw new Error('当前本机服务尚未支持简介字段，请先保存草稿，等待新版发布服务接入。')
      if (form.scheduleMode !== 'now')
        throw new Error('本机定时任务需要新版任务服务。你可以先保存排程草稿。')
      if (form.assets.some((asset) => !asset.serverPath))
        throw new Error('请先将素材上传至本机素材库。')
    }
    const batchId = uid()
    const entries: PublishTask[] = targets
      .filter((account): account is Account => Boolean(account))
      .map((account) => ({
        id: uid(),
        batchId,
        mode: mode.value,
        kind: form.kind,
        account: copy(account),
        title: form.overrides[account.id]?.title.trim() || form.title.trim(),
        description: form.overrides[account.id]?.description.trim() || form.description,
        body: form.body,
        tags: copy(form.tags),
        assets: copy(form.assets),
        scheduleMode: form.scheduleMode,
        scheduledAt: form.scheduledAt,
        status: mode.value === 'demo' ? 'preview' : 'queued',
        createdAt: Date.now(),
        message:
          mode.value === 'demo' ? '演示任务仅用于体验队列，不会向平台发布。' : '等待手动开始执行。',
      }))
    tasks.value.unshift(...entries)
    return entries.length
  }
  async function runTask(id: string) {
    if (desktop) {
      await window.sauDesktop!.startTask(id)
      await refreshDesktop()
      return
    }
    const task = tasks.value.find((item) => item.id === id)
    if (!task || task.mode !== 'live' || task.status !== 'queued' || busy.value) return
    task.status = 'running'
    task.message = '正在调用本地发布服务，请保持工作区打开。'
    try {
      await http.post(
        '/postVideo',
        {
          type: task.account.legacyType,
          title: task.title,
          tags: task.tags,
          fileList: task.assets.map((asset) => asset.serverPath),
          accountList: [task.account.filePath],
          enableTimer: false,
          category: 0,
          productLink: '',
          productTitle: '',
        },
        { silent: true, timeout: 0 },
      )
      task.status = 'submitted'
      task.message = '本地服务已返回，平台发布结果仍需核验。'
    } catch (error) {
      task.status = 'unknown'
      task.message =
        '没有取得明确发布结果，请先到创作者中心核验，避免重复发布。' +
        (error instanceof Error ? ' ' + error.message : '')
    }
    task.finishedAt = Date.now()
  }
  async function cancelTask(id: string) {
    const task = tasks.value.find((item) => item.id === id)
    if (desktop) {
      await window.sauDesktop!.cancelTask(id)
      await refreshDesktop()
      return
    }
    if (task && ['queued', 'preview'].includes(task.status)) {
      task.status = 'cancelled'
      task.message = '已取消，未调用发布服务。'
      task.finishedAt = Date.now()
    }
  }
  async function interruptTask(id: string) {
    if (!desktop) throw new Error('中断运行中的任务需要桌面客户端。')
    await window.sauDesktop!.interruptTask(id)
    await refreshDesktop()
  }
  return {
    desktop,
    desktopInfo,
    revision,
    pendingTaskCount,
    flushWorkspace,
    onBeforeSuspend,
    initializeDesktop,
    mode,
    theme,
    storageError,
    loading,
    connection,
    connectionError,
    accounts,
    materials,
    sampleAccounts,
    sampleMaterials,
    liveAccounts,
    liveMaterials,
    drafts,
    tasks,
    currentDrafts,
    currentTasks,
    pendingTasks,
    busy,
    refreshData,
    setMode,
    saveDraft,
    addTasks,
    runTask,
    cancelTask,
    interruptTask,
    normalizeAccount,
  }
})
