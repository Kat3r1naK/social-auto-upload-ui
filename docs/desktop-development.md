# Windows 桌面客户端开发记录

最新修正：2026-11-14 的 0.1.2 默认进入真实本机工作区，明确账号授权入口，并增加运行任务的进程树中断。行为与验证见 [0.1.2 记录](desktop-0.1.2.md)。下文保留首次 0.1.0 开发记录。

日期：2026-11-13。基于已完成的第一版深紫色 Vue 3 + TypeScript 界面继续开发。

## 本轮实现

- Electron 主进程及 preload 均使用 TypeScript，开启 contextIsolation、sandbox、webSecurity，关闭渲染层 Node 集成。固定 IPC 方法校验发送窗口和参数，页面不能直接调用终端或读取 Cookie。
- 桌面业务为 TypeScript + Zod + Node 内置 SQLite；不新增 FastAPI 或本机 HTTP 监听。任务、事件、素材、账号及工作区存入当前用户目录的 `workspace/studio.sqlite3`。
- 默认数据目录为 `%APPDATA%/SAU Studio/workspace`。主题、示例内容和草稿也进入 SQLite；浏览器预览保留原先 localStorage 行为。
- 原生文件输入通过 Electron webUtils 获取真实路径，导入时记录路径、大小及修改时间。刷新或重启可恢复媒体地址，发布前再次验证文件。移除素材只移除记录，保留原始文件。
- 共用 `shared/platforms.ts` 管理 17 平台能力；worker 为 16 个已有 CLI 平台构造实际 parser，额外包装 TikTok 历史入口。分类、封面、创作声明等按 parser 生成表单，Facebook Page 强制填写目标主页。
- 登录、检查和发布在独立 Python 进程中执行；登录显示可见浏览器，B 站将 biliup 二维码呈现在账号弹窗。原项目 `cookies/<platform>_<alias>.json` 会话可显式导入，导入后保持未验证。
- 队列按账号串行，最多并发两个发布任务；登录/检查与同账号发布互斥。加入队列后仍需手动开始；本地定时在确认开始后启用。退出、睡眠或重启错过时间不会盲目补发。
- worker 请求和结果为私有文件，成功只记为已提交待核验；不从终端文本推断公开发布。异常或中断结果进入待核验，没有自动重试。
- 运行任务可在详情中提交验证码，每个 worker 的 `verify_code.txt` 位于自己的任务目录，验证码内容不写入队列日志。
- 关闭窗口保留托盘；退出时提示运行中及已启用任务，并清理对应 worker 子进程树。
- 构建配置生成 NSIS 安装包，保留用户数据，附带 Python、两套匹配的 Chromium、biliup 和文章渲染依赖。文章渲染复用 Electron 内置 Node。

## 开发与构建

在仓库根目录执行：

```powershell
npm ci
npm ci --prefix sau_frontend
uv sync --python 3.12 --extra desktop
npm ci --prefix utils/article_renderer --ignore-scripts
npm run prepare:runtime
npm run desktop
```

构建与检查：

```powershell
npm test
uv run --extra desktop python desktop/python/check_upstream.py
npm run build
npm run check:electron
npm run dist:win
npm run check:bundle
```

`prepare:runtime` 从对应驱动的官方地址准备浏览器，并沿用上游的 biliup 运行时下载器；首次需要网络。资源进入忽略提交的 `desktop/runtime/`，输出包位于 `release/`。worker 源码修改后必须重跑运行时准备，否则主进程可能仍调用旧的已打包 worker。运行时 manifest 保存 worker 源文件的 SHA-256。

从 0.1.4 起，准备运行时还会生成与 worker 可执行文件 SHA-256 绑定的平台参数 JSON；修改 CLI 参数后也需重新准备运行时。发行包中的 Playwright／Patchright 驱动共用 Electron 内置 Node，不再额外携带各自的 node.exe。`check:bundle` 会检查元数据并在最终包中实际离线启动两套浏览器。新版本性能与完整验收见 [0.1.4 记录](desktop-0.1.4.md)。

## 已验证与未验证

- Vue 严格类型检查和 Vite 生产构建通过；Electron SQLite 可用，实际版本由 `check:electron` 输出。
- 7 项桌面测试通过，覆盖同账号串行、不同账号并发、重复启动拦截、重启恢复、待核验、定时错过处理、素材变更、取消及会话导入隔离，含下面的 worker 参数检查。
- 17 平台的 25 种受支持内容组合已实际加载打包 worker 的参数 schema，未访问平台或发表内容。
- 20 项上游非网络回归测试通过，覆盖文章渲染及 Facebook / Instagram 参数和内容处理。
- Windows 原生客户端已打开，并在实际设置页看到 SQLite 连接、数据目录和运行时信息。
- 最终打包版在清空 PATH 后完成 SQLite 查询、Markdown 渲染及 biliup 版本检查；确认两套 Chromium 的版本目录与各自驱动元数据匹配。
- 最终 app.asar 中的主进程、服务、worker 管理器和 preload 与已检查的构建文件 SHA-256 一致；打包 Python worker 与运行时 manifest 记录的源文件匹配。

## 本轮交付

- 安装包：`release/final/SAU Studio Setup 0.1.0.exe`，758,857,663 字节，约 759 MB。
- 免安装入口：`release/final/win-unpacked/SAU Studio.exe`；复制运行时需要保留同目录的所有文件和 resources。
- 安装包 SHA-256：`53387B08C5716407BC8E0D6B125C911C09B52EECB50DADE2FD2FA55EC932D559`。
- 实测 Electron 45.3.1、内置 Node 24.22.2、SQLite 3.53.4；biliup-cli 1.3.5。
- 当前已打开的打包验收窗口使用独立的临时测试目录；正式启动安装包或上面的免安装入口时，不传测试环境变量，即使用固定的 `%APPDATA%/SAU Studio`。

这些检查不等于全平台真实发布验收。仍需用可用账号逐平台验证登录、上传、验证码、提交及结果；B 站二维码和 TikTok 新登录等待方式也需要真实账号验证。平台原生定时、已有作品核验/删除、旧 Flask `cookiesFile` 账号迁移、代理、独立的等待用户状态和部分高级参数仍需继续完善。当前定时明确为本地执行，不冒充原生定时。桌面本机工作区的素材引用已持久化；示例工作区导入的演示媒体仍受原先会话 URL 的限制。

当前测试包未做发行证书签名；本轮不宣称已经在无开发环境的干净 Windows 机器上完成安装、升级和卸载验收。
