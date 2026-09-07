# C01｜FK-C01-005 原后端路线与基础修复报告

## 1. 范围与基线

- 分支：`codex/01-backend-foundation-fixes`，起点`b7a95fe85e7c1ce18861cb2bb04d934a5bb8f2ee`；固定开源基线仍为`572f3e20fb2c2ae243013c0bdc3e05054c708745`。
- 第一版正式路线已决定为“小程序前端＋精简原NestJS／Prisma／MySQL后端”。停止CloudBase投入；既有本地13项模拟与官方资料分析保留，但真实云端未验证且不再阻断本路线。
- 本轮只做安全边界、现有状态接口并发保护及保留范围门禁；未建完整新业务模型、未做破坏性迁移、未合main、未部署公网。

## 2. 实际修复

### 图片权限

- MinIO匿名读策略从全桶`bucket/*`收紧为仅`system/*`。家庭图片key固定为`family/{familyId}/{category}/{date}/{uploader-random}.ext`。
- 上传身份来自JWT用户，并从数据库取得家庭；上传返回对象key和15分钟签名URL。新增鉴权签名读取、本人删除接口。
- 服务端解析并校验key，拒绝目录穿越、非法分类、跨家庭读取和非上传者删除。正式菜图片上传额外要求当前家庭`creator`（首版丈夫映射）。
- 单元测试覆盖：跨家庭访问、篡改key、同家庭读取、本人删除、同家庭他人删除、妻子上传正式菜图片、系统素材匿名策略。
- 未验证：真实MinIO升级后的存量对象兼容／清理、真实网络签名URL、图片内容魔数和病毒扫描；C03需在隔离对象存储复验。

### 可信身份与角色

- 全局JWT守卫继续从签名token取得用户，并查数据库拒绝注销账号；业务接口不接受前端自报当前用户。
- 正式菜新增／修改／下架由服务端查询活跃`creator`成员关系后授权，妻子收藏和浏览不受影响；跨家庭菜谱仍拒绝。
- 餐单厨师状态操作继续按餐单内`chefUserId`校验；妻子直接取消仅允许待确认，已接单返回“需申请”冲突，丈夫不能借客户取消接口绕过拒单流程。
- 首次绑定完整流程、固定`husband/wife`枚举、邀请失败恢复尚未开发；本轮用现有“丈夫创建家庭→creator、妻子加入→member”作最小权限映射。

### 重复与并发

- 现有餐单状态更新改为`id + 已读取status`条件更新；并发抢先变更导致Prisma P2025时返回`ORDER_VERSION_CONFLICT`，不会覆盖新状态。
- 新增成功比较交换和并发冲突测试。已有跨家庭、参与者、厨师角色和状态迁移测试纳入门禁。
- 目标日期／餐次、亲亲价格／价格快照、调整版本和请求幂等键在现schema中不存在，因此本轮只冻结契约，未虚构完成。同餐位唯一必须在后续schema任务以数据库唯一机制＋事务实现。

## 3. 有效门禁

新增根命令`pnpm run verify:retained`。在本机使用固定pnpm 9.12.0执行，结果通过：

- shared：Lint、TypeScript检查、构建及餐单活跃状态契约测试通过；补齐ESLint 9配置，并明确已上菜不再占用进行中餐位。
- backend保留域（auth、family、recipe、order核心、storage）：Lint零告警、TypeScript检查、构建通过；7套件74测试全部通过。
- mini-app保留API客户端：Lint零告警；微信目标构建通过。项目为JavaScript，原`typecheck`仍是占位命令，未把它写成通过；小程序自动化测试亦未执行。

门禁需要在本环境设置`C01_PNPM_CLI`并将`docs/architecture/bin`置于PATH首位，避免主机pnpm 11触发替换依赖。该环境细节不改变代码结果。

## 4. 全仓门禁与问题分类

本期门禁不等于全仓通过。2026-09-07补跑全后端Jest：23套件中21通过、2失败；158用例中139通过、19失败。失败集中在拟暂缓的`MessageService`缺`WsGateway`测试依赖和`AchievementService`缺`EvaluatorRegistry`。小程序全量Lint仍为12错误、1460警告，主要是旧页面格式和Node配置全局；本轮未全面清零。Web管理后台与Nest后端不是同一模块：Web后台旧生产构建18条TS诊断，本轮未修；Nest后端保留范围构建通过。

| 分类                     | 问题                                                                | 处理                                             |
| ------------------------ | ------------------------------------------------------------------- | ------------------------------------------------ |
| 两路线／当前路线必须解决 | 图片家庭边界、JWT可信身份、正式菜单角色、餐单状态并发               | 本轮最小修复并本地测试；待C03独立复验            |
| 仅原后端路线             | 实际MySQL事务下同餐位唯一、幂等表、完整价格快照；通知／登录线上配置 | 后续schema与集成任务                             |
| 拟删除／暂缓             | 爱心币、成就、AI、复杂消息、旧星级结算、Web管理后台                 | 不进入本期门禁；保留失败证据，不关闭测试伪造通过 |
| 缺环境                   | 双微信账号、AppID、订阅模板、合法域名、真机、隔离MinIO集成          | 后续验收环境验证                                 |

## 5. C01原第0阶段剩余项

基线、许可、真实构建／启动／迁移、三方汇总和路线决定已完成；本轮完成基础权限、状态并发和保留门禁。仍未完成的是目标业务schema／接口本身、真实微信／对象存储集成、全仓清理和C03独立复验。这些不是本轮可宣称完成的正式业务或验收。

## 6. 文件与命令证据

核心修改位于`backend/src/modules/storage/`、`backend/src/modules/order/order.service.ts`、`backend/src/modules/recipe/recipe.service.ts`及对应测试；门禁文件为`backend/jest.retained.config.cjs`、`packages/shared/eslint.config.mjs`与各`package.json`。

主要命令：

```powershell
pnpm run verify:retained
pnpm --filter @family-kitchen/backend exec jest --runInBand
pnpm --filter @family-kitchen/mini-app run lint
```

第一条通过；后两条保留上述全仓失败证据。测试均使用虚构家庭、用户和图片buffer；没有真实照片、凭据或公网发布。

## 7. 独立验收与协作

C01只完成实现者自测，不替代C03。复验步骤见`docs/codex/handoffs/C01_TO_C03_FK-C01-005_REVALIDATION.md`。C02接口与规则影响见`docs/codex/handoffs/C01_TO_C02_FK-C01-005_API_AND_RULES.md`。仓库写入不会自动启动其他员工，需外部启动C02／C03读取本分支。
