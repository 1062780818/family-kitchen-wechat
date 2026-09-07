# C01→C03｜FK-C01-006 独立复验交接

本文件只准备复验输入，不代表 C03 已被自动启动，也不代表缺陷已关闭。

## 固定版本

- 分支：`codex/01-foundation-defect-fixes`
- 实现提交：`6217995b0e995314dd4074f50a3f37d125571226`
- 退回版本：`23516180875f6bf2364546cb907310561a7aaae5`
- 原证据：`fa001484ace4f4b4d52b1c21dfe2335980a3790e`
- 结果摘要：`docs/codex/evidence/C01_FK-C01-006/RESULTS.md`

请从本分支最新提交复验；`6217995` 是不含报告文件的固定实现提交，可用于精确代码比较。

## 环境要求

- pnpm 9.12.0、Node.js >=18、独立 MySQL 8、独立私有 MinIO；不要连接正式数据或上传真实家庭照片。
- Nest API、MySQL、MinIO 均只需本机监听。设置 `MINIO_SIGNED_URL_TTL_SECONDS=2` 可快速验证过期；正式默认仍受 900 秒上限约束。
- 集成脚本使用隔离密码身份，不代表微信登录通过。请勿把测试密码入口暴露公网。

## 一键保留门禁／干净目录

在无 `node_modules`、无旧生成物的新 worktree 中：

```powershell
pnpm dlx pnpm@9.12.0 run verify:retained:clean
```

预期：冻结安装后先生成 Prisma Client，再依次通过 shared、backend 保留域、mini-app 保留 API／图片消费者／测试／微信构建。图片消费者存在既有格式 warning，但应为 0 error。数据库迁移应另行在隔离库执行：

```powershell
pnpm --filter @family-kitchen/backend run db:migrate:deploy
```

## FK-C03-003-01 复验

修复位置：`backend/src/modules/order/order.service.ts`，`updateWithExpectedStatus` 改为数据库条件 `updateMany` 并检查受影响行数；相关单测在 `order.service.spec.ts`。

启动隔离 API 后运行：

```powershell
$env:C01_API_BASE='<your-local-api-base>'
$env:C01_TEST_PASSWORD='<your-isolated-test-password>'
$env:DATABASE_URL='<your-isolated-mysql-url>'
node tests/integration/foundation-defect-regression.mjs
```

重点独立核验：

1. 两个接单竞争响应只有一个 200，另一个为 `ORDER_VERSION_CONFLICT`；库内状态合法。
2. `order_accepted` 通知业务记录只能增加 1 条；普通 HTTP 访问日志可有 2 条，不应混淆。
3. 两个 `prepping` 竞争也只能有一个 200；完成后再请求不能再次执行。
4. 使用不同状态操作、越权 JWT 或已变化状态时，不得被当作成功重放。

## FK-C03-003-02 复验

修复位置：后端 `storage`、`recipe`、`order`、`timeline`、`user` 服务；小程序 `src/api/storage.js` 及菜品／动态／餐单／头像四个消费者；旧数据工具 `backend/src/scripts/migrate-storage-refs.ts`。

重点独立核验：

1. 上传后菜品、上菜图、动态与家庭头像只持久化稳定 `family/...` key，不能把带 `X-Amz-Signature` 的 URL 写回。
2. URL 过期后，授权用户重新读取业务数据仍得到稳定引用，并能经 `/storage/url` 获取新 URL；服务重启后重复。
3. 跨家庭读取、篡改 family/category/key、错误分类保存、非上传者删除、引用中删除均被服务端拒绝。
4. 未引用对象由上传者删除后不能重新签发。
5. 小程序展示字段可以是临时 URL，但提交字段必须继续是 sibling `imageRefs`／`servedImageRefs`／`avatarRef` 或上传结果 `key`。

旧数据工具在构建后执行：

```powershell
pnpm --filter @family-kitchen/backend run storage:refs:preview --env-file="<absolute-test-env-file>"
pnpm --filter @family-kitchen/backend run storage:refs:apply --env-file="<absolute-test-env-file>" --backup="<absolute-new-backup.json>"
pnpm --filter @family-kitchen/backend run storage:refs:rollback --env-file="<absolute-test-env-file>" --backup="<absolute-backup.json>"
```

预期：只转换可信 MinIO 来源、家庭／分类／上传者可核实、对象存在的记录；外部 URL 和归属不明记录不变；备份文件不可覆盖；迁移后若记录又被编辑，rollback 应拒绝覆盖新值。

## 全量门禁应保留的失败

- 全后端当前预期仍是 `21/23` 套件、`143/162` 测试通过；19 个失败不能跳过。逐项归属见证据摘要：11 个 MessageService 初始化缺 `WsGateway`，8 个 AchievementService 初始化缺 `EvaluatorRegistry`。
- 小程序全量 Lint 当前为 `8 errors / 1460 warnings`；其中公共／家庭相邻范围 5 错误仍未关闭，AI／聊天暂缓范围 3 错误。
- 如果数字或失败归属变化，请按新证据报告，不要为了匹配本文件放宽断言。

## 未关闭项

- `FK-C03-003-04`：生产密码登录入口仍开放，未在 FK-C01-006 中修复。
- 微信登录、通知模板、合法域名、双账号与真机未执行。
- C03 应独立决定 `FK-C03-003-01` 至 `03` 是否关闭；C01 自测不能替代该结论。
