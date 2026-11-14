import type {
  Account,
  ComposerForm,
  ContentKind,
  Material,
  PublishTask,
  SavedWorkspace,
} from '../sau_frontend/src/types/studio'

export interface PlatformOption {
  key: string
  label: string
  type: 'text' | 'number' | 'boolean' | 'select' | 'file'
  required: boolean
  choices?: string[]
  default?: string | number | boolean
  hint?: string
}
export interface DesktopInfo {
  version: string
  dataDirectory: string
  workerReady: boolean
  workerMessage: string
  maxWorkers: number
}
export type TaskSummary = Omit<
  PublishTask,
  'body' | 'description' | 'tags' | 'assets' | 'platformOptions' | 'articleBasePath'
>
export interface TaskQuery {
  page?: number
  pageSize?: number
  query?: string
  status?: PublishTask['status'] | 'all'
  history?: boolean
}
export interface TaskPage {
  items: TaskSummary[]
  total: number
  page: number
  pageSize: number
}
export interface TaskCounts {
  total: number
  pending: number
  running: number
}
export interface DesktopSnapshot {
  workspace?: SavedWorkspace
  accounts: Account[]
  materials: Material[]
  tasks: TaskSummary[]
  taskCounts: TaskCounts
  info: DesktopInfo
}
export interface TaskEvent {
  id: number
  taskId: string
  time: number
  level: string
  message: string
}
export interface AccountInput {
  id?: string
  platformId: string
  name: string
  group: string
}
export interface DesktopAPI {
  snapshot(includeWorkspace?: boolean): Promise<DesktopSnapshot>
  taskPage(query: TaskQuery): Promise<TaskPage>
  taskDetail(id: string): Promise<PublishTask>
  materialDetail(id: string): Promise<Material>
  exportContent(scope: 'tasks' | 'workspace', query?: TaskQuery): Promise<boolean>
  setMaxWorkers(value: 1 | 2): Promise<void>
  onPrepareSuspend(callback: () => Promise<void>): () => void
  saveWorkspace(workspace: SavedWorkspace): Promise<void>
  importFile(file: File): Promise<Material>
  removeMaterial(id: string): Promise<void>
  saveAccount(account: AccountInput): Promise<Account>
  removeAccount(id: string): Promise<void>
  accountAction(id: string, action: 'login' | 'check'): Promise<void>
  options(platformId: string, kind: ContentKind): Promise<PlatformOption[]>
  chooseOptionFile(): Promise<string | undefined>
  enqueue(form: ComposerForm): Promise<number>
  startTask(id: string): Promise<void>
  cancelTask(id: string): Promise<void>
  interruptTask(id: string): Promise<void>
  taskEvents(id: string): Promise<TaskEvent[]>
  submitVerification(id: string, code: string): Promise<void>
  importAccounts(): Promise<number>
  openDataDirectory(): Promise<void>
  setWindowTheme(theme: 'dark' | 'light'): Promise<void>
  onChanged(callback: () => void): () => void
}
