export type ContentKind = 'video' | 'note' | 'article'
export type WorkspaceMode = 'demo' | 'live'
export type AccountId = string | number
export type AccountStatus = 'valid' | 'expired' | 'checking' | 'unverified'
export type TaskStatus =
  | 'preview'
  | 'queued'
  | 'scheduled'
  | 'running'
  | 'submitted'
  | 'unknown'
  | 'cancelled'
  | 'failed'
  | 'missed'
export interface Platform {
  id: string
  name: string
  logo?: string
  kinds: ContentKind[]
  schedule?: boolean | 'experimental'
  legacyType?: number
}
export interface Account {
  id: AccountId
  platformId: string
  name: string
  group: string
  status: AccountStatus
  filePath?: string
  legacyType?: number
  message?: string
  avatarUrl?: string
}
export interface Material {
  id: AccountId
  name: string
  kind: ContentKind
  size: number
  url?: string
  duration?: string
  serverPath?: string
  createdAt?: string
  sample?: boolean
  body?: string
  localPath?: string
  modifiedAt?: number
}
export interface AccountOverride {
  title: string
  description: string
}
export interface ComposerForm {
  kind: ContentKind
  title: string
  description: string
  tags: string[]
  body: string
  selectedAccountIds: AccountId[]
  assets: Material[]
  scheduleMode: 'now' | 'later'
  scheduledAt: string
  overrides: Record<string, AccountOverride>
  platformOptions?: Record<string, Record<string, string | number | boolean>>
  articleBasePath?: string
}
export interface Draft extends ComposerForm {
  id: string
  mode: WorkspaceMode
  updatedAt: number
}
export interface PublishTask {
  id: string
  batchId: string
  mode: WorkspaceMode
  kind: ContentKind
  account: Account
  title: string
  description: string
  body?: string
  tags: string[]
  assets: Material[]
  scheduleMode: 'now' | 'later'
  scheduledAt: string
  status: TaskStatus
  createdAt: number
  finishedAt?: number
  message: string
  platformOptions?: Record<string, string | number | boolean>
  armed?: boolean
  articleBasePath?: string
}
export interface SavedWorkspace {
  mode: WorkspaceMode
  theme: 'dark' | 'light'
  sampleAccounts: Account[]
  sampleMaterials: Material[]
  drafts: Draft[]
  tasks: PublishTask[]
}
export type LegacyAccountRow = [number, number, string, string, number]
export interface LegacyMaterial {
  id: number
  filename: string
  filesize: number
  file_path: string
  upload_time: string
}
export interface ApiResponse<T> {
  code: number
  data: T
  msg?: string | null
  message?: string
  success?: boolean
}
