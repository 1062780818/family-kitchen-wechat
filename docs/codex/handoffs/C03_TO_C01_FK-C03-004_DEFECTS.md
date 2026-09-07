# C03→C01｜FK-C03-004 复验缺陷交接

> 写入本文件不等于 C01 已启动。请由 ChatGPT 正式派发修复与复验任务。

## 已关闭原缺陷

- `FK-C03-003-01`（S1）CLOSED：真实 MySQL 并发接单/备菜均为一次 200、一次 `409/ORDER_VERSION_CONFLICT`；数据库状态合法；接单通知增量为 1；完成后重试、冲突状态与越权请求均失败，合法后续操作可用。
- `FK-C03-003-02`（S1）CLOSED：真实 MinIO 下长期字段保存稳定 key；2秒 URL 过期后可鉴权刷新；重复编辑、服务重启、跨家庭、篡改、引用删除和四个小程序消费者通过。
- `FK-C03-003-03`（S2）CLOSED：无依赖/无生成物的新克隆首次执行 `verify:retained:clean` 退出0，backend 90/90、mini-app 4/4。

## FK-C03-004-01｜S1｜迁移交接命令错置备份路径

- 建议负责人：C01（迁移脚本与运行手册）。
- 前置：pnpm 9.12.0；显式提供隔离数据库/MinIO环境；指定一个不存在的绝对备份路径。
- 复现：执行交接原命令 `pnpm --filter @family-kitchen/backend run storage:refs:apply -- '<backup.json>'`。
- 预期：脚本在指定路径以不可覆盖方式写入备份，再应用转换；rollback可用同一路径恢复。
- 实际：pnpm实际调用 `node ... apply "--" "<backup.json>"`；脚本读取 `process.argv[3]`，将 `--` 当备份路径，在 `backend/--` 写备份并已应用数据库变更；指定路径不存在。未显式导出环境时，preview还因未加载 `backend/.env` 报 `DATABASE_URL` 缺失。
- 影响：操作员会误判备份位置和可回退性，部署目录切换后可能失去恢复入口；不允许用于正式数据。
- 证据：`migration-preview-before.log`、`migration-apply-first.log`；修正调用后的逻辑证据为 `migration-apply-corrected-argument-form.log`、`migration-rollback-corrected-argument-form.log` 等。
- 建议：脚本使用严格参数解析并拒绝 `--`/多余参数；命令入口负责加载明确环境；增加“指定备份文件确实存在、路径匹配、可回退”的端到端测试，并修订交接命令。

## FK-C03-004-02｜S1｜生产缺管理员配置时使用固定默认凭据

- 建议负责人：C01（认证/生产配置）。
- 前置：`NODE_ENV=production`，其余必填项完整，故意不设置 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD`。
- 复现：调用 `POST /auth/admin/login`，凭据 `admin/admin123456`；使用返回 Token 请求 `GET /admin/users?page=1&pageSize=1`。
- 预期：生产启动失败、管理入口不注册，或已知默认凭据始终拒绝。
- 实际：登录返回200并签发管理员 Token；受 `AdminGuard` 保护的用户列表返回200。
- 影响：漏配两个可选变量即可用公开已知凭据访问管理数据，属于重大认证配置风险。
- 证据：`production-auth-missing-admin-config-v2.log`；代码位置 `backend/src/config/env.validation.ts` 与 `backend/src/modules/auth/auth.service.ts`。
- 建议：生产环境强制管理员配置且拒绝默认值，或在首版不部署/不注册管理接口；补“缺失/默认值时启动失败或登录拒绝”的生产配置测试。

## FK-C03-003-04｜S2｜生产密码自注册/登录仍开放

- 状态：OPEN，本轮未修复；不因“存在密码登录”直接升级为 S1。
- 实际：生产模式 `POST /auth/password-login` 可用新手机号自注册并签发 JWT，小程序登录页仍暴露；最新阶段决策未批准 H5 入口进入首版。
- 边界：错误密码401、缺Token401；JWT用户/家庭/角色由服务端解析，伪造前端头无效；未发现普通测试账号或缺Token回退测试身份。
- 建议负责人：ChatGPT决定处置阶段，C01实现生产关闭/隔离，C03复验。正式发布前必须关闭或取得明确批准并完成安全验收。
- 证据：`production-auth-missing-admin-config-v2.log`、`production-missing-jwt-fails-closed.log`。

## FK-C03-004-03｜S2｜小程序全量 Lint 计数和归属不完整

- 建议负责人：C02修复页面，C01修正集成报告/门禁归属。
- 复现：固定提交运行 `pnpm --filter @family-kitchen/mini-app run lint`。
- 预期：报告所述 `8 errors / 1460 warnings`，并完整区分保留与暂缓范围。
- 实际：`10 errors / 1460 warnings`。除报告中的5个保留相邻和3个暂缓错误外，`mini-app/vite.config.js`还有2个基础设施错误（`process`、`__dirname`未声明）。无跳过。
- 影响：不推翻保留图片消费者4/4和构建通过，但全仓门禁及证据准确性未达标。
- 证据：`mini-full-lint.log`。

## 修复后复验最小集

1. 精确固定新业务提交；在隔离库用交接中的原样命令完成 preview/apply/rollback/重复执行，并断言备份绝对路径。
2. 生产缺失/默认管理员配置时启动或登录必须失败，且不能访问任一管理接口。
3. 回归并发单次副作用、真实MinIO稳定引用、服务重启、跨家庭与正常授权路径。
4. 重跑小程序全量 Lint并报告实际错误、警告、失败和跳过数量。
