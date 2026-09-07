# C03→C01｜FK-C03-003 基础修复复验缺陷

> 本文件记录独立复验发现，不代表已启动 C01。请由 ChatGPT 正式派发修复任务。

## FK-C03-003-01｜S1｜旧状态并发更新可重复成功

- 建议负责人：C01（后端状态机/数据库并发）。
- 前置条件：固定提交 `23516180875f6bf2364546cb907310561a7aaae5`，真实 MySQL 8.4.10；创建一个 `pending` 餐单。
- 复现步骤：以同一丈夫 JWT 对同一餐单并发发送两次接单；进入 `accepted` 后，再并发发送两次开始备菜。
- 预期：每组仅一个请求成功；另一个返回冲突，错误码 `ORDER_VERSION_CONFLICT`。
- 实际：两组结果均为 `[200, 200]`；串行第三次才因非法状态返回 400。
- 影响：破坏幂等/并发门禁，可能重复发送通知或重复执行后续副作用。最终状态值相同不能消除重复成功的风险。
- 证据：`docs/codex/evidence/C03_FK-C03-003/foundation-integration.log` 中 `concurrent-accept-one-success`、`concurrent-prepping-one-success`；复现脚本 `tests/qa/revalidation/foundation-integration.mjs`。
- 修复建议：使用能够返回受影响行数的条件更新（或显式版本字段/事务锁），只在 `count === 1` 时执行通知等副作用；对真实 MySQL 增加并发回归测试。

## FK-C03-003-02｜S1｜临时签名图片 URL 被持久化

- 建议负责人：C01（存储/API合同与集成）牵头，C02修改小程序消费者。
- 前置条件：真实 MinIO 私有家庭对象；上传一张虚构图片。
- 复现步骤：调用上传接口，观察返回 `key` 和带签名的 `url`；检查菜品编辑、动态、餐单详情、头像编辑对返回值的处理。
- 预期：业务数据持久化稳定对象 key；每次显示时由鉴权接口换取新的短时签名 URL，或采用经确认的等价安全合同。
- 实际：签名 URL 实测 `X-Amz-Expires=900`，家庭对象直接 URL 为 403；页面把 `u.url` / `r.url` 写入 `imageUrls` 或 `avatarUrl`，15 分钟后该业务数据中的图片地址失效。
- 影响：正式菜图、上菜图、动态和头像的核心读取链路随签名过期而失效。
- 证据：`foundation-integration.log` 的 `signed-url-ttl-900`、`private-direct-read-denied`；`static-signed-url-consumers.log` 列出五处消费者。
- 修复建议：冻结并同步存储合同，避免任何临时签名 URL 落库；同时回归历史已落库 URL 的迁移/兼容策略。

## FK-C03-003-03｜S2｜全新环境保留域门禁缺少 Prisma 生成

- 建议负责人：C01（工程门禁/复现文档）。
- 复现步骤：在无 `node_modules` 的固定提交 worktree 执行冻结锁文件安装；直接执行交接指定 `pnpm run verify:retained`。
- 预期：交接给出的命令在全新环境独立完成保留域检查。
- 实际：backend TypeScript 检查因 Prisma Client 类型未生成而退出 2；显式执行 `pnpm run db:generate` 后，相同门禁通过。
- 证据：`verify-retained.log`、`prisma-generate.log`、`verify-retained-after-generate.log`。
- 修复建议：将 Prisma 生成纳入安装/门禁脚本，或在交接中把它列为不可省略前置步骤，并在空缓存环境持续验证。

## FK-C03-003-04｜S2｜生产运行路径仍开放密码自注册/登录

- 建议负责人：C01（认证入口）与 ChatGPT（决定移除阶段）。
- 复现步骤：以生产模式启动后端，调用 `POST /auth/password-login` 使用新手机号；检查小程序登录页。
- 预期：正式微信小程序身份只走冻结的微信登录/首次邀请绑定路径；隔离测试身份不能成为生产兜底入口。
- 实际：接口返回 200 并签发 JWT，小程序仍可调用该入口。该 JWT 受服务端家庭权限约束，未发现冒充已有用户或跨家庭，因此未定 S1。
- 证据：`foundation-integration.log` 的 `production-password-login-observed`；`static-password-login-surface.log`。
- 修复建议：由 ChatGPT确认处置版本；正式发布前移除或用明确的非生产配置强制关闭，并补生产配置测试。

## 复验要求

修复后请提供新的固定业务 Commit。C03需在独立 MySQL/MinIO 环境重跑：空依赖门禁、两组真实并发、家庭图片全链路、生产认证入口以及相关正常授权回归。不得仅以 Mock 或开发员工自测替代独立复验。
