# SAU Studio 架构图生成说明

依据：当前 0.1.3 源码。生成方式：内置 image_gen，非 CLI/API 回退。

以下为完整生成提示词；图中 Node 复用仅指已实现的文章渲染，两个浏览器驱动仍使用独立 Node。数字为发行包逻辑文件体积近似值，未将未来优化画为已实现。

```text
Use case: infographic-diagram.
Create ONE high-resolution Chinese software architecture diagram of the actual current SAU Studio Windows desktop app, version 0.1.3, dated 2026-11-14. This is an engineering diagram grounded in existing code, not a proposed future architecture. The user wants an image showing the entire latest architecture, including why the app uses disk space.

Visual: polished editorial engineering infographic, crisp flat vector style, very legible Simplified Chinese typography, white/light neutral background, dark navy text, restrained purple for the desktop application, teal for persistent data, amber for heavy runtime dependencies, gray dashed lines for separate legacy entry points. Landscape approximately 3840 x 2560. Generous spacing. Align modules to a clean grid; use thin orthogonal arrows with arrowheads and short labels. No 3D, no screenshots, no decorative illustrations, no fake logos, no watermarks. Prioritize precise readable labels and correct relationships.

Main title exactly: "SAU Studio 最新桌面架构"
Subtitle: "v0.1.3 · Windows · 2026-11-14"
Legend: "实线：当前调用链   虚线：状态通知 / 独立入口"

MAIN FLOW, clearly numbered and flowing left to right across the main upper two-thirds:
1. RENDERER, purple column titled "① 桌面界面"
   Card "Vue 3 + TypeScript" with "Vite · Element Plus · Vue Router"
   Card "8 个功能页面" with "工作台 / 发布中心 / 草稿箱 / 素材库" and "账号管理 / 任务中心 / 发布记录 / 设置"
   Card "Pinia 工作区" with "草稿与主题 / 本机数据快照 / 列表分页"
   Bottom port "window.sauDesktop"
   Note "Electron BrowserWindow · 沙箱隔离"
2. BRIDGE AND CONTROL PLANE, purple column titled "② Electron 主进程"
   Top narrow card "preload.ts" with "contextBridge → 类型化 IPC"
   Card "main.ts" with "窗口 / 托盘 / 单实例 / 退出生命周期" and "app:// 页面 · sau-media:// 本地素材"
   Large central card "StudioService · service.ts"
   Lines: "账号与素材管理 / 发布前校验 / 草稿工作区"
   "任务调度：每秒检查到期队列"
   "发布任务并发 ≤ 2 · 同账号互斥"
   "平台参数缓存 / 请求去重 / 串行读取"
   Card "StudioStore · store.ts" with "SQLite · WAL · 事务 / 索引查询 / 重启恢复"
   Connect UI port to preload using arrow "IPC 请求"; preload to main/service. Service to Store "读写".
3. EXECUTION, purple column titled "③ 独立任务进程"
   Card "worker.ts · 进程管理"
   "启动 / 中断进程树 / 日志脱敏 / 结果读取"
   "request.json → result.json"
   Card "sau-worker.exe" with "Python 3.12 · PyInstaller"
   Sub-label "desktop/python/worker.py"
   "单次操作：参数 / 登录 / 检查 / 发布"
   Card "共享上传核心"
   "sau_commands → uploader"
   "统一平台参数 / 复用原有上传实现"
   Service arrow to worker.ts "创建操作"; worker.ts arrow to Python "受控子进程"; Python arrow to core "平台适配".
   A dashed return arrow from execution to Service labeled "结果 / 日志"; dashed Service back to Pinia labeled "studio:changed → 合并刷新快照".
4. RUNTIME DEPENDENCIES, amber column titled "④ 平台运行环境"
   THREE separate branch cards, with arrows from shared upload core:
   a. "Patchright + 独立 Node" → "Chromium 1208" ; caption "多数浏览器上传平台"
   b. "Playwright + 独立 Node" → "Chromium 1254" ; caption "TikTok"
   c. "biliup.exe" ; caption "Bilibili 登录与上传"
   Ancillary card "文章与媒体工具"
   "Markdown → HTML / 二维码 / 图片与视频校验"
   "文章渲染复用 Electron Node"
   "OpenCV · NumPy"
   Very important: the two driver Nodes remain separate in this implemented version; DO NOT show them already unified or reused from Electron. Only article rendering already reuses Electron Node.
5. EXTERNAL PLATFORMS, right column titled "⑤ 社交平台"
   A compact external platform group "17 平台"
   list exactly:
   "抖音 / 小红书 / 快手 / 视频号"
   "Bilibili / 百家号 / 大鱼号"
   "支付宝生活号 / 微博 / 虎扑"
   "雪球 / 知乎 / YouTube / TikTok"
   "Facebook / Facebook Page / Instagram"
   Footer "视频 / 图文 / 文章，按平台支持"
   Runtime branches a and b arrows to external platform group labeled "浏览器交互"; biliup arrow to Bilibili label "CLI".
   Small note "平台提交完成后仍需核验"

BOTTOM PERSISTENCE BAND, teal, located beneath columns 2 and 3:
Title "本机持久化 · userData / workspace"
Two adjacent cards:
"studio.sqlite3" with "settings / accounts / materials / tasks / events"
"本机文件" with "cookies / login_qr / jobs / results / logs"
Third compact card "素材原文件" with "保留原位置，只记录文件引用"
Connect StudioStore down to SQLite. Connect Python worker down to local files for session / artifacts. Connect Service to original-file references; main.ts's sau-media protocol accesses those files. Do not depict media being copied into the database.

SEPARATE SMALL GRAY SIDE/BOTTOM PANEL:
Title "其他独立入口"
"CLI / Agent Skills → 共享上传核心"
"Web 预览 → 示例数据 / localStorage"
"历史 Web → Flask HTTP 服务"
Note "旧 Flask 不参与桌面端启动"
Use dashed connectors only to shared core where appropriate, not a Flask dependency in desktop IPC flow. Do not invent FastAPI, Redis, cloud APIs, cloud storage, Docker, a remote queue, or automatic updates.

BOTTOM RESOURCE SUMMARY, an unobtrusive horizontal amber strip:
Title "0.1.3 安装体积构成（约，MiB）"
"Electron 357  +  浏览器及附件 851  +  Python worker 390  +  biliup 93  +  业务包 12  ≈  1703 MiB"
Small annotation "两份驱动 Node 合计约 181 MiB，已包含在 worker 中"
Last tiny but readable scope note: "图示为已实现架构；Node 驱动复用与平台组件按需下载尚未落地。"

Make the entire diagram coherent and usable at full resolution. Preserve all component names, arrow direction, Chinese text meaning, process boundaries, data ownership, and implemented-vs-proposed distinction. Avoid crossings and text clipping.
```
