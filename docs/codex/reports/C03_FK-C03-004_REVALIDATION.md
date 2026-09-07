# C03｜FK-C03-004 两项 S1 修复复验与认证入口核实

## 1. 固定输入与结论

- 被验收业务提交：`b22ee29634c7187281bfe2beb3672eb29a3a4bc0`。
- 固定实现提交：`6217995b0e995314dd4074f50a3f37d125571226`，已核实为被验收提交祖先。
- 原 C03 证据：`codex/03-foundation-revalidation@fa001484ace4f4b4d52b1c21dfe2335980a3790e`。
- 独立验收分支：`codex/03-foundation-revalidation-004`。
- 整体结论：**FAIL**。

原 `FK-C03-003-01` 并发 S1 可关闭；原 `FK-C03-003-02` 临时图片 URL 持久化 S1 的新写入、读取、前端消费者和真实存储路径可关闭。复验同时发现两项新的 S1：按交接命令执行旧数据迁移会把备份路径误解释为 `--`，以及正式配置缺少管理员账号变量时启用固定默认管理员凭据并可读取受保护用户数据。存在未关闭 S1，故本轮不能整体 PASS。

## 2. 输入文件核实

固定提交内已读取：

- `docs/codex/handoffs/C01_TO_C03_FK-C01-006_REVALIDATION.md`
- `docs/codex/reports/C01_FK-C01-006_FIX_REPORT.md`
- `docs/codex/evidence/C01_FK-C01-006/RESULTS.md`
- 交接引用的并发/存储集成脚本、重启脚本、迁移工具、保留门禁脚本及小程序图片引用测试。

交接中泛称的报告名与仓库实际文件名不同；实际存在并读取的是 `C01_FK-C01-006_FIX_REPORT.md`，没有猜测缺失内容。

## 3. 独立环境

- 从共享远程新克隆独立目录并检出固定提交；首次执行前 `node_modules=False`，无旧 Prisma 生成物。
- Node.js `v24.19.0`；通过实际命令 `pnpm dlx pnpm@9.12.0 run verify:retained:clean` 锁定 pnpm 9.12.0。
- 独立 MySQL 8.4.10：新数据目录、隔离库 `c03_004`、本机端口 33616，13 个迁移实际部署。
- 独立 MinIO：新数据目录、隔离桶 `c03-004`、本机端口 33619；签名 URL TTL 设为 2 秒。
- API 使用生产模式等效配置，只在本机测试；测试数据为虚构手机号和 1×1 PNG。
- 完成后 API、MySQL、MinIO 均已停止，33600、33601、33616、33619、33620 无监听；临时环境文件已删除。

## 4. 原并发 S1：关闭

### 4.1 结果

`FK-C03-003-01`：**CLOSED**。

- C01 集成脚本在 C03 独立 MySQL/MinIO 环境为 `19/19 PASS`。
- C03 扩展脚本为 `65/65 PASS`，其中包含另一组独立家庭和餐单，不复用 C01 的状态断言作为唯一证据。
- 同一 `pending` 餐单并发接单实际为一个 200、一个 `409/ORDER_VERSION_CONFLICT`。
- 接单前后数据库 `notificationLog(type=order_accepted)` 增量严格为 1，最终数据库状态为 `accepted`。
- 同一 `accepted` 餐单并发进入 `prepping` 实际为一个 200、一个 `409/ORDER_VERSION_CONFLICT`，最终数据库状态为 `prepping`。
- 完成后重试返回 400；接单后再拒单返回 400；妻子、其他家庭用户的状态请求返回 403；合法丈夫仍可继续进入 `cooking`。

### 4.2 边界

接口没有独立的客户端版本号字段，因此“旧版本”通过两个请求基于同一旧数据库状态竞争验证；数据库条件更新只允许一次生效。没有恢复或扩大不属于目标流程的状态。

## 5. 原图片 S1：原缺陷关闭，迁移交付另有新 S1

### 5.1 新写入、读取及前端消费者

`FK-C03-003-02` 原“临时签名 URL 被长期字段持久化”缺陷：**CLOSED**。

真实 MinIO 与数据库结果：

- 菜品、手工动态、用户头像、上菜图均只落库稳定 `family/{familyId}/{category}/...` key。
- 菜品两次编辑保存后仍为同一 key；临时签名 URL 写入菜品、动态、头像、上菜图均被 400 或 409 拒绝。
- 错误分类 key、跨家庭 key、篡改后不存在 key 均被拒绝。
- 原 2 秒签名 URL 过期返回 403；同家庭授权用户重新读取业务记录仍得到稳定 key，并经 `/storage/url` 取得新 URL，真实对象读取为 200。
- API 服务重启后，数据库 key、重新签发和对象读取仍通过。
- 跨家庭签发/删除返回 403；引用中对象删除返回 409；未引用对象本人删除后不能再签发。
- 家庭对象未经签名直接读取返回 403，未通过公开桶、永久公开 URL 或关闭鉴权实现修复。
- 小程序图片引用测试 `4/4 PASS`，直接修改的四个消费者为 0 error；微信目标构建通过。消费者提交 key，临时 URL 仅用于展示。

### 5.2 旧数据工具逻辑

在显式提供数据库/MinIO环境并使用正确参数形式时，工具逻辑通过：

- preview 只识别 1 条可信、同家庭、同分类、对象存在的 MinIO 签名 URL。
- apply 将该记录转换为稳定 key；之后 preview 为 0，重复 apply 为 0 changes。
- rollback 成功恢复 1 条；备份文件存在时 apply 因 `EEXIST` 拒绝覆盖。
- apply 后修改记录，再 rollback 被拒绝，且新编辑保持不变。
- 外部 URL、跨家庭签名 URL、对象不存在 URL、头像上传者不匹配记录始终保持原值；未被误分配或删除。

### 5.3 新阻断缺陷

交接给出的命令形式：

`pnpm --filter @family-kitchen/backend run storage:refs:apply -- '<backup.json>'`

在锁定的 pnpm 9.12.0 下实际变为：

`node dist/scripts/migrate-storage-refs.js apply "--" "<backup.json>"`

脚本只读取 `process.argv[3]`，因此把 `--` 当备份路径，在 `backend/--` 生成备份并已执行数据变更；指定的备份路径并不存在。rollback 同样会选错参数。另按文档直接运行 preview 时，脚本不会自动加载 `backend/.env`，首次以 `DATABASE_URL` 缺失失败；显式导出环境后才可执行。

这不是单纯展示问题：操作员按交接命令会在错误位置留下备份并误判可回退性，可能在部署目录切换后失去恢复入口。新列 `FK-C03-004-01`，S1，旧数据迁移在修正文档/脚本并复验前不得用于正式数据。

## 6. 干净环境门禁

结论：**PASS**。

在无 `node_modules`、无旧生成物的新克隆目录，首次执行：

`pnpm dlx pnpm@9.12.0 run verify:retained:clean`

退出码 0，实际过程：冻结锁文件安装 1554 包 → Prisma Client 自动生成 → shared Lint/类型/构建及 1/1 测试 → backend 保留域 Lint/类型/构建及 10 套件、90/90 测试 → mini-app 保留 API/图片消费者、4/4 测试及 mp-weixin 构建。没有人工补跑 Prisma 生成或共享包准备。

`FK-C03-003-03`：**CLOSED**。

## 7. 正式配置密码入口与缺失配置

### 7.1 用户密码登录

`FK-C03-003-04`：**OPEN，S2，本轮不因该项单独阻断，但阻断正式发布**。

- `POST /auth/password-login` 在 `NODE_ENV=production` 仍注册、默认可访问；新手机号实测返回 200、`isNewUser=true` 并签发 JWT。
- 小程序登录页和 API 客户端仍公开使用该入口，不是只在后端残留未暴露代码。
- 最新阶段决策把 H5 账号绑定列为未确认范围、应隔离或不暴露；V0.3 没有重新批准它进入首版。旧 PRD 对 H5 的描述不能覆盖最新决策。
- 该入口不是直接身份绕过：错误密码返回 401；JWT 主体、家庭和角色由服务端数据库解析；伪造前端身份/家庭/角色头无效；无 Token 返回 401。
- 未发现默认普通测试账号、固定普通用户凭据或缺 Token 回退测试身份。真实微信登录仍未验证，密码登录结果没有被冒充为微信登录通过。

### 7.2 固定默认管理员凭据

新列 `FK-C03-004-02`：**S1，OPEN，本轮阻断**。

- `env.validation.ts` 在缺少 `ADMIN_USERNAME`/`ADMIN_PASSWORD` 时默认使用 `admin/admin123456`；`AuthService`也保留相同默认值。
- 生产模式等效环境故意省略这两个变量后，`POST /auth/admin/login` 使用固定默认值返回 200 并签发管理员 Token。
- 该 Token 实测可访问受 `AdminGuard` 保护的 `/admin/users` 并获得用户列表，不是只有无效 Token 或无权限外壳。
- 缺少 `JWT_SECRET` 时服务启动实际失败，说明核心 JWT 密钥本身是 fail-closed；但这不能抵消管理员配置的宽松默认值。

正式配置应把管理员凭据改为生产必填、禁止已知默认值，或在首版不部署/不注册管理后台路线；修复方案由 C01/ChatGPT确定，C03不改业务源码。

## 8. 保留模块与全仓残留

### 8.1 保留模块

**PASS**：以 `verify:retained:clean` 首次执行结果为准，backend 90/90、mini-app 4/4，构建和声明范围 Lint 均通过。

### 8.2 全后端

**FAIL**：21/23 套件通过，143/162 测试通过；19 个为实际失败，0 跳过。

- `message.service.spec.ts` 11 项在断言前因缺 `WsGateway` 初始化失败：其中复杂聊天/催单 8 项、已取消亲亲小费 3 项。
- `achievement.service.spec.ts` 8 项在断言前因缺 `EvaluatorRegistry` 初始化失败，属于已暂缓成就模块。

这些失败未进入保留门禁，也没有被删除或伪装成跳过；其测试本身当前不能证明对应功能。未发现它们回流破坏本轮并发、基础认证或图片正常路径。

### 8.3 小程序全量 Lint

**FAIL**：独立实测为 `10 errors / 1460 warnings`，不是 C01 报告的 `8 errors / 1460 warnings`。

- 3 errors 属于暂缓 AI/聊天页面。
- 5 errors 位于公共占位/家庭页面，属于保留相邻范围。
- 另 2 errors 位于 `mini-app/vite.config.js`（`process`、`__dirname` 未声明），属于小程序构建基础设施；微信构建虽通过，但全量 Lint 不能标绿。

新列 `FK-C03-004-03`，S2：修正门禁计数和归属，并在后续前端质量任务关闭 7 个保留相邻/基础设施错误。该项不推翻本轮图片消费者 4/4 与微信构建结果，但阻断全仓发布门禁。

## 9. 缺陷状态汇总

| ID            | 等级 | 结论   | 摘要                                                   |
| ------------- | ---: | ------ | ------------------------------------------------------ |
| FK-C03-003-01 |   S1 | CLOSED | 并发条件更新、数据库状态和接单通知单次副作用均通过     |
| FK-C03-003-02 |   S1 | CLOSED | 新写入、过期刷新、服务重启、前端消费者和私有桶均通过   |
| FK-C03-003-03 |   S2 | CLOSED | 干净目录首次门禁自动完成安装与 Prisma 生成             |
| FK-C03-003-04 |   S2 | OPEN   | 未批准的生产密码自注册/登录仍默认开放                  |
| FK-C03-004-01 |   S1 | OPEN   | 旧数据迁移交接命令误把 `--` 当备份路径，正式回退不可信 |
| FK-C03-004-02 |   S1 | OPEN   | 缺管理员配置时固定默认凭据可读取受保护用户数据         |
| FK-C03-004-03 |   S2 | OPEN   | 小程序全量 Lint 实为10错误，7个属于保留相邻/基础设施   |

## 10. 证据说明

证据目录：`docs/codex/evidence/C03_FK-C03-004/`。

关键证据：

- `verify-retained-clean-first-run.*`：干净目录首次门禁和独立测试数量。
- `mysql-migrate-deploy-pnpm-9-12.*`：独立 MySQL 13 个迁移。
- `c01-foundation-regression-independent-env.*`：C01脚本在独立环境 19/19。
- `c03-foundation-fix-real-integration-v4.*`：C03扩展真实集成 65/65。
- `storage-after-backend-restart.*`：服务重启后稳定 key 与真实对象读取。
- `migration-*`：预览、应用、回退、重复、备份保护、编辑冲突和交接命令缺陷。
- `production-auth-missing-admin-config-v2.*`：固定默认管理员、受保护数据访问及密码入口。
- `production-missing-jwt-fails-closed.*`：JWT 密钥缺失时启动失败。
- `backend-full-jest.*`、`mini-full-lint.*`：全仓残留的真实数量和失败归属。

早期 `c03-foundation-fix-real-integration*` 失败日志保留：首轮因复用已有活跃餐单造成夹具无 ID；后续两轮校正响应结构/状态断言，其中一次对象删除遇到瞬时数据库连接错误。相同删除路径随后连续两轮得到预期 409，最终 v4 为 65/65。这些过程未被删除，也未用其替代最终固定脚本结果。

## 11. 发布边界

本轮不具备正式发布条件：存在两项新 S1、生产密码入口 S2、全仓后端和小程序门禁未绿；真实微信登录、通知模板、合法域名、双账号与真机仍未验证。两项原 S1 的代码路径关闭不等于完整产品、正式数据迁移或发布验收通过。
