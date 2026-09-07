# C01｜FK-C01-006 可复验结果摘要

日期：2026-09-07。以下均为实现者自测证据，不是 C03 独立验收结论。测试仅使用虚构账号、1×1 PNG 与隔离数据。

## 固定输入与输出

- 被退回业务版本：`23516180875f6bf2364546cb907310561a7aaae5`
- C03 证据：`fa001484ace4f4b4d52b1c21dfe2335980a3790e`
- 本轮实现提交：`6217995b0e995314dd4074f50a3f37d125571226`
- 分支：`codex/01-foundation-defect-fixes`

## 环境

- Windows；Node.js `v24.19.0`；pnpm `9.12.0`；Git `2.53.0.windows.3`
- MySQL `8.4.10`，仅监听 `127.0.0.1:33516`，隔离库 `c01_006`
- MinIO `RELEASE.2025-09-07T16-13-09Z`，仅监听 `127.0.0.1:33519`，隔离桶 `c01-006`
- Nest API 仅监听本机 `127.0.0.1:33500`；图片签名有效期在回归环境设为 2 秒

## 真实 MySQL／MinIO 回归

入口：

```powershell
$env:C01_API_BASE='<isolated-api-base>'
$env:C01_TEST_PASSWORD='<isolated-test-password>'
$env:DATABASE_URL='<isolated-mysql-url>'
node tests/integration/foundation-defect-regression.mjs
```

结果：`19/19 PASS`。关键原始结果摘要：

- 并发接单：HTTP `200 + 409(ORDER_VERSION_CONFLICT)`；库内状态 `accepted`；`order_accepted` 通知业务记录数 `1`。
- 并发进入 `prepping`：HTTP `200 + 409(ORDER_VERSION_CONFLICT)`；完成后再请求为 `400(INVALID_STATUS_TRANSITION)`；库内状态 `prepping`。
- 菜品字段保存 `family/{familyId}/recipe/...` 稳定 key；原 2 秒 URL 过期返回 `403`；鉴权重取后 API `200`、对象读取 `200`。
- 跨家庭重取返回 `403(STORAGE_CROSS_FAMILY_FORBIDDEN)`；引用中对象删除返回 `409(STORAGE_OBJECT_IN_USE)`；未引用对象删除后重取返回 `400(STORAGE_OBJECT_NOT_FOUND)`。
- 两次重复菜品编辑都只保存同一稳定 key；迁移用错误签名 URL 样本在隔离库成功建立。

服务重启后入口：

```powershell
$env:C01_API_BASE='<isolated-api-base>'
$env:C01_TEST_PASSWORD='<isolated-test-password>'
node tests/integration/storage-restart-check.mjs
```

结果：`PASS`；数据库仍为稳定 key，重新签发 `200`，MinIO 对象读取 `200`。

## 旧数据修复工具

构建后依次执行 `preview → apply → rollback → apply`。命令入口：

```powershell
pnpm --filter @family-kitchen/backend run build
pnpm --filter @family-kitchen/backend run storage:refs:preview --env-file="<absolute-test-env-file>"
pnpm --filter @family-kitchen/backend run storage:refs:apply --env-file="<absolute-test-env-file>" --backup="<absolute-new-backup.json>"
pnpm --filter @family-kitchen/backend run storage:refs:rollback --env-file="<absolute-test-env-file>" --backup="<absolute-backup.json>"
```

隔离库结果：预览识别 `1` 条；首次应用把签名 URL 转为稳定 key；回退恢复原值；第二次应用再次转为稳定 key。备份采用 `wx` 创建，已存在文件会拒绝覆盖。只转换可信 MinIO 来源、家庭／分类／上传者可核实且对象真实存在的记录；外部 URL、归属不明或对象不存在的数据保持原值。

## 干净目录首次执行

在提交 `6217995` 的新 detached worktree 中确认 `node_modules=False` 后执行：

```powershell
pnpm dlx pnpm@9.12.0 run verify:retained:clean
```

结果：退出码 `0`。冻结锁文件安装新增 `1554` 包（复用主机包缓存、下载 `0`），随后自动执行 Prisma Client 生成，再执行保留模块门禁。数据库迁移没有混入此命令，仍通过 `pnpm --filter @family-kitchen/backend run db:migrate:deploy` 单独执行；本轮隔离库的 13 个迁移全部成功。

## 门禁结果

- `pnpm run verify:retained`：退出码 `0`。
- shared：Lint、类型检查、构建通过；`1/1` 测试通过。
- backend 保留模块：Lint 零告警、类型检查、构建通过；`10/10` 套件、`90/90` 测试通过。
- mini-app 保留 API：Lint 零告警；稳定图片引用 `4/4` 测试通过；四个直接修改的图片消费者 `0 error / 221 warnings`；微信目标构建通过。
- 全后端 Jest：退出码 `1`；`21/23` 套件、`143/162` 测试通过，`19` 个实际失败、`0` 跳过。
- 小程序全量 Lint：退出码 `1`；`8 errors / 1460 warnings`，涉及 33 个文件。不能称为全仓通过。

## 全后端 19 项逐项归属

全部是测试模块初始化失败，并非跳过：

### `message.service.spec.ts`：11 项，缺少 `WsGateway`

复杂订单聊天／催单（暂缓）与亲亲小费结算（需求已取消）测试，在执行断言前失败：

1. rejects text without text field
2. rejects on terminal order
3. accepts emoji message and stores emojiKey
4. rejects when chef tries to rush
5. rejects when order is not COOKING
6. rejects after 3 rushes
7. rejects when last rush within cooldown
8. allows rush after cooldown elapsed
9. rejects when chef tries to tip
10. rejects when balance insufficient
11. settles tip by inserting two love-point logs

前三项属于复杂订单聊天，不等同于第一版必须保留的小程序内部通知；第 4～8 项属于催单机制，尚未纳入第一版保留门禁；第 9～11 项依赖已取消的线上亲亲结算，应随范围清理而删除或重写。原失败保留，未通过加空断言或删除测试制造通过。

### `achievement.service.spec.ts`：8 项，缺少 `EvaluatorRegistry`

成就模块已批准暂不投入，以下测试在执行断言前失败：

1. unlocks family_first_dish when family count reaches 1
2. unlocks family_10_dishes when count reaches exactly 10
3. does not unlock if current rating < 5
4. unlocks five_star_streak_5 when last 5 orders all 5 stars
5. does not unlock if any in last 5 is < 5 stars
6. does not re-unlock an existing badge
7. listMine filters by ownerType=user and userId
8. uses OrderStatus.COMPLETED in count query

## 小程序全量 Lint 剩余归属

- 保留相邻范围：`guest-placeholder.vue` 2 个重复 key 错误；`family/settings.vue` 1 个未使用变量；`family/setup.vue` 2 个未使用变量。共 5 个错误，后续前端范围任务仍应关闭。
- 暂缓模块：AI 页面 2 个未使用变量、聊天列表 1 个未使用变量。共 3 个错误。
- 本轮直接修改的 `profile/edit.vue` 与 `recipe/edit.vue` 已消除原错误；未全面格式化既有页面的 1460 条警告。
