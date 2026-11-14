import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { DesktopAPI } from '../shared/desktop'

const api: DesktopAPI = {
  snapshot: (includeWorkspace) => ipcRenderer.invoke('studio:snapshot', includeWorkspace),
  taskPage: (query) => ipcRenderer.invoke('studio:task-page', query),
  taskDetail: (id) => ipcRenderer.invoke('studio:task-detail', id),
  materialDetail: (id) => ipcRenderer.invoke('studio:material-detail', id),
  exportContent: (scope, query) => ipcRenderer.invoke('studio:export-content', scope, query),
  setMaxWorkers: (value) => ipcRenderer.invoke('studio:max-workers', value),
  onPrepareSuspend: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, token: string) => {
      void callback()
        .then(() => ipcRenderer.send('studio:suspend-ready', token))
        .catch(() => {})
    }
    ipcRenderer.on('studio:prepare-suspend', listener)
    return () => ipcRenderer.removeListener('studio:prepare-suspend', listener)
  },
  saveWorkspace: (workspace) => ipcRenderer.invoke('studio:save-workspace', workspace),
  importFile: (file) => ipcRenderer.invoke('studio:import-file', webUtils.getPathForFile(file)),
  removeMaterial: (id) => ipcRenderer.invoke('studio:remove-material', id),
  saveAccount: (account) => ipcRenderer.invoke('studio:save-account', account),
  removeAccount: (id) => ipcRenderer.invoke('studio:remove-account', id),
  accountAction: (id, action) => ipcRenderer.invoke('studio:account-action', id, action),
  options: (platform, kind) => ipcRenderer.invoke('studio:options', platform, kind),
  chooseOptionFile: () => ipcRenderer.invoke('studio:choose-option-file'),
  enqueue: (form) => ipcRenderer.invoke('studio:enqueue', form),
  startTask: (id) => ipcRenderer.invoke('studio:start-task', id),
  cancelTask: (id) => ipcRenderer.invoke('studio:cancel-task', id),
  interruptTask: (id) => ipcRenderer.invoke('studio:interrupt-task', id),
  taskEvents: (id) => ipcRenderer.invoke('studio:task-events', id),
  submitVerification: (id, code) => ipcRenderer.invoke('studio:verification', id, code),
  importAccounts: () => ipcRenderer.invoke('studio:import-accounts'),
  openDataDirectory: () => ipcRenderer.invoke('studio:open-data-directory'),
  setWindowTheme: (theme) => ipcRenderer.invoke('studio:window-theme', theme),
  onChanged: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('studio:changed', listener)
    return () => ipcRenderer.removeListener('studio:changed', listener)
  },
}
contextBridge.exposeInMainWorld('sauDesktop', api)
