# SAU Studio 前端

基于现有 social-auto-upload fork 重做的多平台内容发布界面，采用用户选定的第一版深紫色工作台方案。

技术栈：Vue 3、TypeScript、Vite、Element Plus、Pinia、Vue Router、Axios 和 Sass。文章预览使用 marked 与 DOMPurify。页面组件使用 `<script setup lang="ts">`，生产构建包含严格类型检查。

## 启动与检查

在本目录使用已安装的 Node.js 和 npm：

```powershell
npm ci
npm run dev
```

开发地址通常为 `http://localhost:5173/`，配置不自动打开浏览器。

```powershell
# 单独检查 TypeScript
npm run typecheck

# 类型检查并生成 dist
npm run build

# 预览生产构建
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort

# 格式化前端源码
npm run format
```

发布中心路由为 `/#/publish-center`，生产输出位于 `dist/`。

## 已实现页面

- 工作台：内容创建入口、草稿、账号与素材概览。
- 发布中心：视频、图文、文章编辑，文件导入，目标账号选择，每账号内容覆盖，内容预览，草稿和队列操作。
- 草稿箱：搜索、筛选、恢复和删除。
- 素材库：导入、搜索、类型筛选、列表/网格、预览和用于发布。
- 账号管理：账号卡片、平台/分组筛选、示例账号管理、旧服务兼容入口。
- 任务中心与发布记录：筛选、详情、取消尚未执行的任务和 JSON 导出。
- 设置：示例/本机工作区、主题、本地数据导出、服务状态和平台能力表。

## 示例与本机工作区

默认打开示例工作区，账号和内容为演示数据；示例队列不会向平台发送内容。可以先体验界面，之后在设置中切换到本机工作区。

浏览器预览的两个工作区分开保存到 localStorage（键为 `sau-studio-v1`），浏览器导入文件使用会话内 Blob URL，刷新后需要重新选择。Electron 桌面客户端通过类型化 IPC 连接 TS 服务和 SQLite，保留真实素材路径并可在重启后恢复。

17 个平台已建立共用能力配置。浏览器本机工作区仍兼容旧服务的四平台基础视频接口；Electron 客户端改用独立 worker，读取各平台真实命令参数生成发布设置。成功返回只记为“已提交、待核验”，结果不明时不会自动重试。

## 服务配置

- 开发环境：`.env.development` 中 `VITE_API_BASE_URL=/api`，由 `vite.config.ts` 代理到 `http://localhost:5409`。
- 生产预览：`.env.production` 中 `VITE_API_BASE_URL=http://localhost:5409`，直接请求本机旧服务。
- 修改环境变量后需要重启开发服务或重新构建。服务离线会显示提示，不会用示例数据冒充本机结果。
- 工作区由设置页选择；旧的 `VITE_USE_MOCK` 变量不负责切换当前工作区。

本轮没有执行真实平台登录或发布。桌面启动、运行时准备和安装包构建见仓库的 [桌面开发记录](../docs/desktop-development.md)。新增桌面业务统一使用 TypeScript，不额外启动 FastAPI。

## 主要目录

```text
src/
├── api/                  # 旧服务接口的 TypeScript 封装
├── components/           # 共用平台标识组件
├── config/platforms.ts   # 17 平台及内容能力配置
├── router/index.ts       # Hash 路由
├── stores/studio.ts      # 工作区、素材、草稿、任务状态
├── types/studio.ts       # 前端领域类型
├── utils/                # 请求、文件导入与格式化
├── views/                # 工作台和各功能页面
├── styles/               # 深浅主题、布局与组件样式
└── main.ts
```

设计、边界及验收记录见仓库根目录的 `docs/frontend-redesign.md`、`docs/windows-client-plan.md` 和 `design-qa.md`。

平台标识和生成图片说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。项目原有许可证保持不变。
