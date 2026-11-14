import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  net,
  nativeTheme,
  protocol,
  shell,
  Tray,
} from 'electron'
import { join, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { existsSync, statSync } from 'node:fs'
import { StudioStore } from './store'
import { StudioService } from './service'
import { resolveRuntime } from './worker'
import { ZodError } from 'zod'

app.setName('SAU Studio')
if (process.env.SAU_STUDIO_DATA) app.setPath('userData', resolve(process.env.SAU_STUDIO_DATA))
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
  {
    scheme: 'sau-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
])
const root = resolve(__dirname, '..', '..')
let window: BrowserWindow | undefined, tray: Tray | undefined, service: StudioService | undefined
let quitting = false
let openWindow: (() => Promise<void>) | undefined
let suspendTimer: ReturnType<typeof setTimeout> | undefined
let suspendToken: string | undefined
let lastURL = 'app://studio/'
let lastBounds: Electron.Rectangle | undefined
let rendererOperations = 0
function cancelSuspend() {
  if (suspendTimer) clearTimeout(suspendTimer)
  suspendTimer = undefined
  suspendToken = undefined
}
function showStudio() {
  cancelSuspend()
  void openWindow?.().catch((error) => dialog.showErrorBox('无法打开 SAU Studio', String(error)))
}
function scheduleSuspend() {
  cancelSuspend()
  suspendTimer = setTimeout(() => {
    if (quitting || !window || window.isDestroyed() || window.isVisible()) return
    if (rendererOperations) {
      scheduleSuspend()
      return
    }
    suspendToken = randomUUID()
    window.webContents.send('studio:prepare-suspend', suspendToken)
  }, 60_000)
  suspendTimer.unref()
}
// Keep the queue and tray alive after releasing the last renderer window.
app.on('window-all-closed', () => {})
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => {
    showStudio()
  })
  void app
    .whenReady()
    .then(async () => {
      const store = new StudioStore(join(app.getPath('userData'), 'workspace'))
      service = new StudioService(
        store,
        resolveRuntime(root, app.isPackaged ? process.resourcesPath : undefined),
        app.getVersion(),
        () => {
          if (window && !window.isDestroyed() && window.isVisible())
            window.webContents.send('studio:changed')
        },
      )
      const frontend = join(root, 'sau_frontend', 'dist')
      protocol.handle('app', (request) => {
        const url = new URL(request.url)
        if (url.hostname !== 'studio') return new Response('Not found', { status: 404 })
        let path: string
        try {
          path = resolve(
            frontend,
            '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname),
          )
        } catch {
          return new Response('Bad request', { status: 400 })
        }
        if (!path.startsWith(frontend + sep) || !existsSync(path) || !statSync(path).isFile())
          return new Response('Not found', { status: 404 })
        return net.fetch(pathToFileURL(path).href)
      })
      protocol.handle('sau-media', (request) => {
        const url = new URL(request.url),
          id = url.pathname.slice(1)
        if (url.hostname === 'avatar' && /^[a-f0-9-]{36}$/.test(id) && store.account(id)) {
          const path = join(store.directory, 'avatars', id + '.png')
          return existsSync(path)
            ? net.fetch(pathToFileURL(path).href)
            : new Response('头像尚未获取', { status: 404 })
        }
        if (url.hostname === 'login' && /^[a-f0-9-]{36}$/.test(id) && store.account(id)) {
          const path = join(store.directory, 'login_qr', id + '.png')
          return existsSync(path)
            ? net.fetch(pathToFileURL(path).href)
            : new Response('正在准备二维码', { status: 404 })
        }
        const material = store.material(id)
        if (url.hostname !== 'asset' || !material?.localPath || !existsSync(material.localPath))
          return new Response('素材已移动，请重新导入。', { status: 404 })
        return net.fetch(pathToFileURL(material.localPath).href, {
          headers: request.headers,
        })
      })
      const trusted = (event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) => {
        if (
          !window ||
          event.sender !== window.webContents ||
          event.senderFrame?.url.split('#')[0] !== 'app://studio/'
        )
          throw new Error('不受信任的界面请求。')
      }
      const handle = (name: string, callback: (...args: any[]) => unknown) => {
        ipcMain.handle('studio:' + name, async (event, ...args: unknown[]) => {
          trusted(event)
          rendererOperations++
          try {
            return await callback(...args)
          } catch (error) {
            if (error instanceof ZodError)
              throw new Error('内容不完整或格式不正确，请检查标题、账号和素材。')
            throw error
          } finally {
            rendererOperations--
          }
        })
      }
      const key = (value: unknown): string => {
        if (typeof value !== 'string' || value.length > 200 || !value) throw new Error('无效标识。')
        return value
      }
      handle('snapshot', (includeWorkspace = true) => {
        if (typeof includeWorkspace !== 'boolean') throw new Error('无效快照请求。')
        return service!.snapshot(includeWorkspace)
      })
      handle('task-page', (query) => service!.taskPage(query))
      handle('task-detail', (id) => {
        const task = store.task(key(id))
        if (!task) throw new Error('任务不存在。')
        return task
      })
      handle('material-detail', (id) => {
        const material = store.material(key(id))
        if (!material) throw new Error('素材不存在。')
        return material
      })
      handle('max-workers', (value) => service!.setMaxWorkers(value))
      handle('export-content', async (scope, query) => {
        if (scope !== 'tasks' && scope !== 'workspace') throw new Error('无效导出请求。')
        const result = await dialog.showSaveDialog(window!, {
          title: scope === 'tasks' ? '导出完整任务记录' : '导出草稿和完整任务记录',
          defaultPath: scope === 'tasks' ? 'sau-publish-records.json' : 'sau-studio-workspace.json',
          filters: [{ name: 'JSON', extensions: ['json'] }],
        })
        if (result.canceled || !result.filePath) return false
        await service!.exportContent(result.filePath, scope, query)
        return true
      })
      ipcMain.on('studio:suspend-ready', (event, token: unknown) => {
        try {
          trusted(event)
        } catch {
          return
        }
        if (
          !suspendToken ||
          token !== suspendToken ||
          !window ||
          window.isVisible() ||
          quitting ||
          rendererOperations
        )
          return
        lastURL = window.webContents.getURL()
        lastBounds = window.getBounds()
        cancelSuspend()
        window.destroy()
        window = undefined
      })
      handle('save-workspace', (value) => service!.saveWorkspace(value))
      handle('save-account', (value) => service!.saveAccount(value))
      handle('remove-account', (id) => service!.removeAccount(key(id)))
      handle('account-action', (id, action) => service!.accountAction(key(id), action))
      handle('import-file', (path) => {
        if (typeof path !== 'string' || path.length > 32768) throw new Error('无效文件。')
        return service!.importFile(path)
      })
      handle('remove-material', (id) => service!.removeMaterial(key(id)))
      handle('options', (platform, kind) => service!.options(key(platform), kind))
      handle('choose-option-file', async () => {
        const result = await dialog.showOpenDialog(window!, {
          title: '选择封面或平台所需文件',
          properties: ['openFile'],
          filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }],
        })
        return result.canceled ? undefined : service!.approveOptionFile(result.filePaths[0])
      })
      handle('enqueue', (form) => service!.enqueue(form))
      handle('start-task', (id) => service!.startTask(key(id)))
      handle('cancel-task', (id) => service!.cancelTask(key(id)))
      handle('interrupt-task', (id) => service!.interruptTask(key(id)))
      handle('task-events', (id) => store.events(key(id)))
      handle('verification', (id, code) => service!.submitVerification(key(id), code))
      handle('import-accounts', async () => {
        const result = await dialog.showOpenDialog(window!, {
          title: '选择原项目根目录（包含 cookies 文件夹）',
          properties: ['openDirectory'],
        })
        return result.canceled ? 0 : service!.importAccounts(result.filePaths[0])
      })
      handle('open-data-directory', () => shell.openPath(store.directory))
      handle('window-theme', (theme) => {
        if (theme !== 'dark' && theme !== 'light') throw new Error('无效主题。')
        nativeTheme.themeSource = theme
        window!.setBackgroundColor(theme === 'light' ? '#faf9fd' : '#0d0c1d')
        window!.setTitleBarOverlay({
          color: theme === 'light' ? '#faf9fd' : '#0d0c1d',
          symbolColor: theme === 'light' ? '#625a72' : '#c1bbd2',
          height: 40,
        })
      })
      const iconPath = join(frontend, 'assets', 'sau-mark.png')
      Menu.setApplicationMenu(null)
      openWindow = async () => {
        cancelSuspend()
        if (window && !window.isDestroyed()) {
          window.show()
          window.focus()
          window.webContents.send('studio:changed')
          return
        }
        const windowTheme = store.workspace()?.theme === 'light' ? 'light' : 'dark'
        nativeTheme.themeSource = windowTheme
        window = new BrowserWindow({
          width: 1487,
          height: 1058,
          ...lastBounds,
          minWidth: 860,
          minHeight: 640,
          title: 'SAU Studio',
          backgroundColor: windowTheme === 'light' ? '#faf9fd' : '#0d0c1d',
          titleBarStyle: 'hidden',
          titleBarOverlay: {
            color: windowTheme === 'light' ? '#faf9fd' : '#0d0c1d',
            symbolColor: windowTheme === 'light' ? '#625a72' : '#c1bbd2',
            height: 40,
          },
          icon: iconPath,
          show: false,
          webPreferences: {
            preload: join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true,
          },
        })
        const currentWindow = window
        window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
          callback(false),
        )
        window.webContents.session.webRequest.onHeadersReceived((details, callback) =>
          callback({
            responseHeaders: {
              ...details.responseHeaders,
              'Content-Security-Policy': [
                "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: sau-media:; media-src 'self' blob: sau-media:; connect-src 'self' http://localhost:5409 http://127.0.0.1:5409; object-src 'none'; base-uri 'self'; frame-src 'none'",
              ],
            },
          }),
        )
        window.webContents.setWindowOpenHandler(({ url }) => {
          if (url.startsWith('https://')) void shell.openExternal(url)
          return { action: 'deny' }
        })
        window.webContents.on('will-navigate', (event, url) => {
          if (!url.startsWith('app://studio/')) event.preventDefault()
        })
        window.once('ready-to-show', () => currentWindow.show())
        window.on('closed', () => {
          if (window === currentWindow) window = undefined
        })
        window.on('close', (event) => {
          if (!quitting && tray) {
            event.preventDefault()
            window?.hide()
            scheduleSuspend()
          }
        })
        await window.loadURL(lastURL)
      }
      await openWindow()
      tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 24, height: 24 }))
      tray.setToolTip('SAU Studio · 关闭窗口后在托盘继续运行')
      tray.setContextMenu(
        Menu.buildFromTemplate([
          {
            label: '打开 SAU Studio',
            click: showStudio,
          },
          { label: '退出', click: () => app.quit() },
        ]),
      )
      tray.on('double-click', showStudio)
    })
    .catch((error) => {
      dialog.showErrorBox('SAU Studio 启动失败', String(error))
      quitting = true
      app.quit()
    })
}
app.on('before-quit', (event) => {
  if (quitting) return
  event.preventDefault()
  if (service?.running || service?.scheduled) {
    const choice = dialog.showMessageBoxSync({
      type: 'warning',
      title: '退出 SAU Studio',
      message: '还有运行中或已启用的任务。',
      detail:
        '退出会停止上传进程，本地定时任务也会暂停。结果不明确的任务需要核验；错过的定时任务不会自动补发。',
      buttons: ['留在后台', '退出客户端'],
      defaultId: 0,
      cancelId: 0,
    })
    if (choice !== 1) return
  }
  quitting = true
  cancelSuspend()
  void service?.stop().finally(() => {
    service?.store.close()
    tray?.destroy()
    app.quit()
  })
  if (!service) app.quit()
})
