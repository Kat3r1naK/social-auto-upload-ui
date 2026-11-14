# SAU Studio desktop

桌面壳、账号/素材/任务服务和 SQLite 均使用 TypeScript。Python worker 复用原有上传核心，浏览器界面只调用受限的类型化 IPC。

- `main.ts`：窗口、协议、托盘、IPC 和退出生命周期。
- `preload.ts`：向渲染层暴露固定方法。
- `service.ts`：素材引用、账号、任务校验与调度。
- `store.ts`：SQLite 事务、事件及重启恢复。
- `worker.ts`：受控子进程、结构化结果及任务验证码。
- `python/worker.py`：平台参数 schema 和上传核心适配。
- `scripts/`：运行时准备及打包检查。
- `tests/`：任务、持久化和运行时回归。

启动、打包及验收边界见 [开发记录](../docs/desktop-development.md)。生成的运行时、数据库及发行文件不提交到仓库。

0.1.4 的安装占用、托盘释放、数据分页、并发模式和验收结果见 [资源优化记录](../docs/desktop-0.1.4.md)。
