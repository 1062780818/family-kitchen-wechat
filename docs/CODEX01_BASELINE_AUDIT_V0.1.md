# FK-C01-001｜Codex-01 开源基线审查 V0.1

## 0. 范围、结论与证据边界

- 审查时间：2026-09-03 至 2026-09-04，Asia/Shanghai。
- 角色：Codex-01，技术负责人、后端、数据与集成。仅第0阶段；未实现新业务、未迁移 CloudBase、未合并他人员工分支。
- 有效依据：启动总指令 V1.1，以及用户随后发布的 FK-C01-001。独立亲亲价格默认1、下单快照、妻子上菜后送达、无余额账本、调整需妻子确认均已确认，不再按旧版“未确认”处理。
- 技术结论：原项目不是纯 README／静态壳。共享包、小程序微信目标、后端可编译；原始数据库迁移、种子、MinIO 上传及后端原业务闭环已真实运行。它可以作为**有条件的代码复用候选**，但不能原样上线，也不能认定已实现本项目需求。
- 阻断上线的问题：后台生产构建失败、后端46项单测失败、Lint不通过、类型检查存在漏检、依赖安全通告、公开图片读取、固定角色与亲亲业务差距。
- 微信边界：未配置产品负责人自有 AppID／AppSecret／模板，也未取得微信开发者工具与真机测试环境。小程序“编译成功”不等于微信登录、通知和真机闭环通过。没有用 H5 或密码登录冒充微信验证。
- 本报告不是 Codex-03 的 PASS／CONDITIONAL PASS／FAIL 验收意见。

## 一、代码基线

| 项目            | 记录                                           |
| --------------- | ---------------------------------------------- |
| 上游仓库        | https://github.com/llgululu/family-kitchen.git |
| 上游分支        | main                                           |
| 固定上游 Commit | `572f3e20fb2c2ae243013c0bdc3e05054c708745`     |
| 上游提交说明    | Update manifest.json                           |
| 上游提交时间    | 2026-06-13 21:07:27 +08:00                     |
| 获取日期        | 2026-09-03                                     |
| 员工分支        | `codex/01-baseline-audit`                      |
| 独立工作区      | `H:\codex\林家餐厅小程序\family-kitchen-c01`   |

最初尝试获取到 `family-kitchen` 时，该共享目录已被其他员工使用并处于 `codex/02-frontend-audit`；没有切换其分支或修改其文件，另从上游独立克隆到 `family-kitchen-c01`。在任何源文件编辑前已记录上游哈希。审查文档的交付提交哈希以最终聊天及 `git log -1` 为准；不把审查提交哈希冒充上游基线哈希。

## 二、环境和真实运行结论

| 环境       | 实测版本／范围                                                                                     |
| ---------- | -------------------------------------------------------------------------------------------------- |
| 系统       | Windows、PowerShell，宿主与沙箱用户存在所有权差异                                                  |
| Git        | 2.53.0.windows.3；仅对指定仓库使用命令级 safe.directory                                            |
| Node       | v24.19.0；README 要求≥20，根 engines≥18，`.nvmrc`为20，声明不一致                                  |
| pnpm       | 固定9.12.0；宿主默认11.19.0，禁止混用                                                              |
| TypeScript | 锁文件安装5.9.3                                                                                    |
| MySQL      | 官方便携8.4.10，127.0.0.1:33316，无系统服务安装                                                    |
| MinIO      | RELEASE.2025-09-07T16-13-09Z，提交07c3a429bfed433e49018cb0f78a52145d4bedeb；127.0.0.1:33319／33320 |
| 后端       | HTTP33300、WS33301；原代码监听0.0.0.0，审查请求只走127.0.0.1                                       |
| 管理端     | Vite5.4.21，审查开发服务127.0.0.1:33317；无头Chrome检查登录页                                      |
| 小程序     | uni-app3.0.0-5000720260410001，Vite5.2.8，微信目标编译／watch                                      |

数据库只有虚构数据：首次超时库 `c01_baseline_audit` 保留用于错误复现；成功重放库 `c01_baseline_replay`。不用生产凭据，不连接用户数据库。测试配置中的密码只是明确的本机占位值，不可复制到部署环境。

### 2.1 最终可复现结果

| 检查                          | 结果                                                                                                                        | 证据                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 冻结依赖安装                  | 成功，1554个安装包，锁文件未改                                                                                              | 19-install-verified.log                    |
| shared build                  | 成功                                                                                                                        | 03-shared-build.log                        |
| Prisma Client生成／schema校验 | 成功，Client5.22.0                                                                                                          | 20-prisma-generate.log、23-db-validate.log |
| 后端build                     | 成功；首次未生成Client时107个编译错误，环境补齐后消失                                                                       | 04、06、21日志                             |
| 小程序生产build               | 两次成功，生成mini-app/dist/build/mp-weixin                                                                                 | 07、29日志                                 |
| 小程序dev                     | 编译成功并进入watch；验证后停止监听，不视为真机成功                                                                         | 31-mini-dev.log                            |
| 管理端生产build               | 失败：应用及工具声明共18条TS诊断                                                                                            | 28-admin-build.log                         |
| 管理端dev／浏览器             | HTTP200，跳转/login，页面加载，无pageerror；未测试全后台页面                                                                | 32、43、44日志                             |
| 数据库迁移deploy              | 全新库13个迁移全部成功，约84秒                                                                                              | 57-migrate-fresh.log                       |
| 原始seed                      | 成功：2用户、1家庭、8菜、3订单、60徽章等                                                                                    | 58-seed-fresh.log                          |
| 迁移状态                      | schema up to date                                                                                                           | 59-status-fresh.log                        |
| README migrate dev复核        | 退出1：检测到待生成变更，非交互环境不能确认；未改SQL                                                                        | 62-migrate-dev-recheck.log                 |
| 数据库与schema只读diff        | 发现title长度及notification_log索引差异；未执行差异SQL                                                                      | 68-schema-drift.log                        |
| 后端启动                      | Nest实际启动，数据库探针status=ok，MinIO初始化成功                                                                          | 60、61日志                                 |
| 原版HTTP冒烟                  | 27项观察完成，详见下文；不是完整回归                                                                                        | 61-api-smoke.json                          |
| 后端Jest                      | 23套件：18通过、5失败；148用例：102通过、46失败                                                                             | 22-backend-test.log                        |
| 管理端Vitest                  | 退出1，未找到测试文件                                                                                                       | 30-admin-test.log                          |
| shared／小程序test            | 退出0但仅echo占位，不能计为测试覆盖                                                                                         | 36、37日志                                 |
| 根lint                        | 退出2，shared缺少ESLint9 flat config；整体不通过                                                                            | 33-lint.log                                |
| 分包lint                      | backend 13错10警告；admin 1错8614警告；mini-app 12错1461警告；均退出1。后台大量警告涉及Windows CRLF，不应当作8614个业务缺陷 | 64、65、66日志                             |
| 原test:e2e脚本                | 退出1，缺test/jest-e2e.json                                                                                                 | 67-e2e-script.log                          |
| 根typecheck                   | 退出0，但mini-app仅echo；admin无-b未遍历references，漏掉build发现的问题                                                     | 34-typecheck.log、admin/tsconfig.json      |
| 根build／test                 | 均退出1，分别受admin构建和无测试文件阻断                                                                                    | 40、41日志                                 |
| OpenAPI类型生成               | 失败：缺openapi.json；导出脚本指向不存在的dist/scripts/export-openapi.js，源码也未找到                                      | 35、42日志                                 |
| 微信登录／通知／真机          | 尚未验证，需要自有平台环境，不能签发通过                                                                                    | 本报告第九节                               |

27项HTTP观察覆盖：存活、真实数据库探针、无Token401、三虚构账号密码登录、原管理员登录、管理员列表、普通用户管理接口403、创建家庭／邀请码／加入、另建隔离家庭、上传图片、匿名读图200、两道菜创建（包括点菜者可建菜）、菜谱列表、两菜统一下单、跨家庭读订单403、食客接单403、厨师接单、备菜、烹饪、上菜、评价、历史读取。原版评价将订单变为completed，测试中奖励25爱心币；这**不是亲亲功能验收**。

### 2.2 环境失败与临时处理

1. Git首次报`remote-https is not a git command`：宿主helper在mingw64/bin而不在Git预期位置；为该进程补PATH后联网克隆成功。
2. 沙箱网络返回EACCES：公开仓库、npm、Prisma引擎和软件包下载通过获准联网执行解决。未全局放开权限。
3. npm不在PATH；改用pnpm，未要求用户安装无关工具。
4. pnpm9安装成功后，根脚本嵌套调用宿主pnpm11，日志出现`Recreating ... node_modules`。中断后以pnpm9恢复并重跑。08、11～17等模块丢失错误是这段审查环境问题，不能归因于业务源码。
5. 安装postinstall没有定位到子目录schema；显式执行`pnpm --filter @family-kitchen/backend db:generate`。没有改Prisma模型。
6. MySQL中文路径启动丢失路径部分，产生`H:\share\english\errmsg.sys`／`H:\data`错误。使用允许目录下ASCII junction重新启动成功，不修改系统PATH、不安装服务。
7. 第一次`migrate dev`的120秒审查超时中断了初始化，后续P3009和seed缺表P2021是该中断的后果，**不是已确认的上游迁移缺陷**。保留失败库，另建全新库，以600秒预算执行deploy，13迁移全部通过。
8. 两个前端声明文件被Vite自动生成器改写；已恢复至基线内容，不作为前端补丁交付。
9. 早期PowerShell Transcript未完整捕获原生命令输出；01、02、18仅作会话元信息，完整终端原文在工具会话。正式19及后续重跑采用stdout／stderr记录器，完整日志不截断，JSON记录命令、版本、耗时和退出码。
10. watch／开发服务器为持续进程；超时或人工终止码只表示审查结束。不能将它误判成编译失败。原31、32清理曾受权限影响而超出预算，已精确停止本次进程。
11. 在成功库上再次运行migrate dev，约256秒后发现`chef_level_definitions.title`从VARCHAR(191)缩为VARCHAR(20)的待迁移变更，并因非交互环境退出。只读diff进一步确认notification_log的两个索引命名／排序差异。`migrate status`的up to date只表示已应用迁移历史，不表示数据库与最新schema完全一致；这是真实的基线迁移欠账，不应与第一次超时混淆。
12. 文档提交首次在Git钩子入口报`/usr/bin/env: sh: No such file or directory`。为本次Git Bash进程显式补充shell路径，并提供同目录POSIX版pnpm固定版本入口；不更改系统PATH或项目钩子，不跳过提交检查。

## 三、许可证与依赖风险

### 3.1 原仓库

已完整阅读固定提交的根LICENSE：**MIT，Copyright (c) 2026 GuLu**。四个工作区未发现覆盖根许可的独立LICENSE／NOTICE。MIT允许使用、复制、修改、合并、分发及再许可，必须在复制件或实质部分保留版权与许可声明，并保留原免责条款；不是“公开在GitHub所以可随便复制”。[MIT官方文本](https://opensource.org/license/mit)

后续引入应保留根LICENSE、记录上游URL和哈希、标识本方修改。第三方依赖许可证不能统一替换成MIT。图片、logo、默认头像和seed所引用的外站素材没有逐项来源凭据；根MIT不能替代素材权属核验。上线前需提供来源授权或改用自有素材，当前仅在隔离测试中使用。

### 3.2 依赖清单与声明保留

生成`38-license-inventory.json`：1554个本机已安装包，保存名称、版本、license元数据、LICENSE／NOTICE相对位置、SHA256与版权摘录；包括所有主要工作区的直接依赖，不包含其他平台未安装可选包，也不是逐文件律师验收。

| 组件                     | 锁定／实测版本               | 许可核查                                                                                                      |
| ------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| NestJS／Fastify          | 10.4.22／4.28.1              | MIT                                                                                                           |
| Prisma客户端／CLI        | 5.22.0                       | Apache-2.0                                                                                                    |
| Vue／Pinia／Element Plus | 3.5.34／2.3.1／2.14.0        | MIT                                                                                                           |
| uni-app各主包            | 3.0.0-5000720260410001       | Apache-2.0                                                                                                    |
| wot-design-uni           | 1.14.0                       | MIT                                                                                                           |
| MinIO JS SDK             | 8.0.7                        | Apache-2.0；不等于服务端许可证                                                                                |
| TypeScript／ECharts      | 5.9.3／6.1.0                 | Apache-2.0                                                                                                    |
| uCharts                  | 2.5.0-20230101               | 元数据写Apache；README和源码头明确Apache2.0，包无独立LICENSE文件；须保留QIUN2018–2022源码声明并补发行许可文本 |
| exif-parser              | 0.1.12                       | 元数据缺license；实际LICENSE.md为MIT，版权Bruno Windels与Daniel Leinich，已人工澄清                           |
| caniuse-lite             | 1.0.30001792                 | CC-BY-4.0，保留署名／来源／许可／修改标识；不要漏算数据许可                                                   |
| MySQL Community服务端    | 8.4.10                       | GPLv2及随包第三方声明；包内LICENSE标题仍写8.4.9，记录该元信息差异，未改其文档                                 |
| MinIO服务端              | RELEASE.2025-09-07T16-13-09Z | GNU AGPLv3，2015–2025 MinIO, Inc.；不能套用SDK的Apache许可                                                    |

MIT／ISC／BSD需保留相应版权和免责条件；Apache2.0需保留许可、适用NOTICE及修改标识；对外再分发MySQL或MinIO时，应按各自实际发行方式重新核验源码提供等义务，不能直接承诺“全部闭源商用无限制”。本次没有再分发它们的二进制。[MySQL官方许可说明](https://www.mysql.com/about/legal/licensing/oem/)、[MinIO官方LICENSE](https://github.com/minio/minio/blob/master/LICENSE)

### 3.3 维护与安全

- 全依赖`pnpm audit --json`：metadata计数critical2、high66、moderate58、low16，共142；扫描图1639与本机1554安装包统计口径不同。原文见27日志，扫描日期2026-09-03/04；不是142个已证实的应用漏洞。
- 生产依赖补扫`pnpm audit --prod --json`：critical1、high43、moderate32、low4，共80，扫描图723；见63日志。仍需按调用可达性验证，不能直接将通告等同实际漏洞。
- critical通告包括`@fastify/middie`子插件中间件认证绕过与Vitest UI任意文件读取／执行。前者需检查实际Nest适配调用路径，后者须区分UI服务与本次`vitest run`，不得夸大为已攻破。[middie通告](https://github.com/advisories/GHSA-72c6-fx6q-fr5w)、[Vitest通告](https://github.com/advisories/GHSA-5xrq-8626-4rwp)
- Fastify4已结束官方LTS；`.nvmrc`所指Node20亦已EOL，不建议以“原README建议”为理由新部署旧运行时。[Fastify维护政策](https://fastify.dev/docs/latest/Reference/LTS/)、[Node维护状态](https://nodejs.org/en/about/eol)
- Nest10／Prisma5／Vite5等处于旧主版本；未核实的维护期限不直接写成“停止维护”。升级须作为后续授权工作并回归uni-app编译，不在本轮执行audit fix或升级锁文件。
- 示例管理员密码和JWT只做字符串类型校验；MinIO整桶公开读已HTTP实测；`ThrottlerModule`存在但未找到`ThrottlerGuard`挂载，不能认为登录已有有效通用限流。
- 状态更新为先读后按id写，缺少状态条件更新／版本检查；一家庭一活跃单检查位于创建事务之外，存在并发竞态风险。需要Codex-03并发复现，不声称本轮已证明可利用。
- WS仅验证JWT、URL携Token，未像HTTP守卫核对账号注销状态；需审查日志泄露与会话撤销一致性。
- 微信消息环境硬编码`developer`，下单服务未调用“新餐单通知厨师”；接单／上菜通知存在，但不能代表“妻子下单丈夫立即收到通知”完整实现。

## 四、功能真实性与复用分类

静态统计：282个src文件、31个注册小程序页面、24个Controller、21个Prisma模型、23个后端spec文件。路径、HTTP装饰器与行号保存在`39-source-inventory.json`。A／B／C表示验证层级，D／E／F表示目标项目处置；允许一模块同时是A和F。

| 类别                           | 事实与建议                                                                                                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A 代码存在且实际运行           | 原密码登录／JWT、家庭创建加入、菜谱增查、上传、多菜餐单、原状态流转、整单评价、历史、部分家庭隔离及管理员权限；仅指已实测HTTP范围。后台登录页真实浏览器可运行。   |
| B 代码存在但受阻／不完整       | 微信登录和通知缺平台验证；后台生产构建失败；原后端单测5套件失败；固定夫妻权限、新亲亲流程不具备。小程序页面只有编译证据，不能全列A。                              |
| C 文档／脚本有声称但缺完整链路 | OpenAPI导出源码和生成文件缺失；CI仅文档草案，未找到实际.github/workflows；shared、小程序自动测试是明确占位；存储只有MinIO实现，不能把接口抽象当作COS／OSS已实现。 |
| D 本版应移除或不暴露           | 爱心币余额、双账本、打赏与撤销、奖励公式、等级／徽章、AI菜谱／推荐／营养／周计划、复杂聊天、商业化运营页面；这里只提出范围清单，没有执行删除。                    |
| E 可直接保留的候选             | 仓库分层、分页／异常处理工具、部分输入校验及公共组件组织、原LICENSE与来源记录；仍需单项验收，不能“整项目E”。                                                      |
| F 需要重构                     | 身份与固定角色、菜谱字段、多菜快照、餐段份量、调整确认、四段状态、通知事件、图片权限、评价解耦、共享契约生成与工程门禁。                                          |

前端候选：`pages/tabbar/menu/menu`、`recipe/detail`、`recipe/edit`、`order/create`、`order/detail`、`order/history`、`notification/list`；公共组件`custom-tabbar.vue`和`guest-placeholder.vue`。这些是复用候选，不是最终页面地图。由Codex-02独立细化，不替其出前端交付。

主要API域：auth、users、families、recipes、orders、storage、notifications、messages、love-points、timeline、achievements、business-config、admin、ai。小程序有手写HTTP／上传／WS封装，不能只换API域名就完成CloudBase迁移。

## 五、初步数据模型差距（只分析，不实施）

| 需求               | 原模型／服务事实                                            | 差距与风险                                                                     |
| ------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 家庭               | Family、familyId隔离                                        | 可复用；缓存失效、离家、并发邀请仍需回归                                       |
| 家庭成员／固定角色 | FamilyMember.role=creator/member；订单每次指定chefUserId    | 创建者不等于固定丈夫，成员不等于妻子；服务器须固定能力权限，不能用性别推导角色 |
| 正式菜品           | Recipe有name/imageUrls/mealTags/flavorTags/difficulty/notes | 缺明确分类、亲亲价格、预计耗时、可选主要食材；notes可改造简介                  |
| 独立亲亲价格       | 无对应字段，只有难度奖励公式                                | 新增每菜价格默认1；禁止照搬爱心币余额                                          |
| 餐单               | Order有双方、expectedServeAt、customerNotes                 | 缺独立日期／早午晚餐段；一活跃单限制与预约需求可能冲突                         |
| 餐单菜品明细       | OrderItem，多菜已跑通，customNotes存在                      | 缺小／正常／大份和逐菜处理状态                                                 |
| 下单价格快照       | recipeSnapshot仅name/imageUrls/difficulty                   | 必须快照价格，不得用当前菜价或奖励总额替代；建议统一快照版本                   |
| 菜品调整方案       | 未找到版本化调整模型／接口                                  | 需区分原单与提案、逐菜接受／采购／替换／拒绝、并发版本                         |
| 妻子确认调整       | accept可直接接单并改时间                                    | 缺确认版本、确认人、时间及服务端接单前置条件                                   |
| 采购备注           | 无专用字段                                                  | 轻量文本即可；不能推导库存／采购系统                                           |
| 菜单外想吃         | OrderItem.recipeId虽可空，但CreateOrderItemDto强制recipeId  | 不能称已支持；缺名称／图／链接／正式收录决定链路                               |
| 亲亲送达记录       | LovePointLog记录增减额和余额                                | 不是送达凭证；需要妻子上菜后确认、幂等、防重复与动画状态，无余额／欠账         |
| 评价记录           | Rating.orderId唯一，一单一评，评分触发奖励及completed       | 粒度待决定；需要与亲亲、四段状态解耦，不能套用自动评价                         |
| 状态流转记录       | Order.status及少量时间；十态转换表                          | 缺独立操作者／前后状态／版本流水；OrderMessage不能假定是完整审计               |

原十态为draft/pending/accepted/prepping/cooking/served/rated/completed/rejected/cancelled。目标四主态已确认；异常协商不应新增大量日常点击，但仍需正式定义服务端异常约束。原上菜DTO强制图片、原评分自动发奖励均不是本项目已确认规则。

## 六、两种架构比较与建议

此处CloudBase指改用其身份、函数／服务、数据与存储能力，不偷换为“原后端搬到托管容器”。CloudBase同样需要家庭权限、事务设计与平台消息授权；不能自动解决业务正确性。[CloudBase身份](https://docs.cloudbase.net/products/auth)、[安全规则](https://cloud.tencent.com/document/product/876/41802)、[存储规则](https://docs.cloudbase.net/storage/security-rules)

| 维度         | A 保留独立后端／MySQL／管理端                         | B 保留界面，改造CloudBase                                          |
| ------------ | ----------------------------------------------------- | ------------------------------------------------------------------ |
| 初期部署     | 需API、MySQL、对象存储、HTTPS及域名；本机链路已证实   | 需开通环境、适配SDK和函数部署；减少自建服务，当前仓库没有适配代码  |
| 后续维护     | 负责补丁、证书、备份恢复、监控与数据库                | 基础设施托管减负，但需维护配额、账单、规则与云函数版本             |
| 微信登录     | 现有code2Session＋JWT可改造，仍缺自有AppID真机验证    | 可利用平台身份上下文；原JWT、管理端身份与会话需要迁移              |
| 通知         | 已有发送封装与站内日志，须补新单事件并修环境          | 可使用平台能力，仍受模板和用户授权限制，不能保证无条件通知         |
| 图片存储     | MinIO上传已跑通；必须修公开读及生命周期               | 云存储可减自建负担，须重写上传和fileID／临时URL映射                |
| 数据安全     | SQL外键／事务可保留；应用层鉴权需加固                 | 安全规则与函数鉴权均要正确；服务端高权限不能只靠客户端规则         |
| 双人权限     | 改现有FamilyMember与服务守卫                          | 重建身份到家庭成员映射及函数权限                                   |
| 增加家庭成员 | 有一对多模型基础，需改上限和参与者假设                | 可设计扩展，但本轮不建设多成员UI                                   |
| 后续对外开放 | 自主性强，需租户、运维、风控、合规再设计              | 托管有助扩容，配额／账单／租户隔离及迁出成本要评估                 |
| 代码复用     | Nest模块、Prisma迁移、DTO、部分测试及HTTP客户端可保留 | 页面／样式可保留；Prisma／迁移／Nest生命周期／WS／Cron不能直接移植 |
| 修改规模     | 工程修复＋核心业务模型改造＋去无关模块                | 上述业务改造之外，还增加数据访问、登录、存储、通知与部署迁移       |
| 核心风险     | 旧依赖、存储隐私、测试债、运维负担                    | 双重改造、平台绑定、接口漂移、迁移时权限及事务回归                 |

**建议：优先A，作为条件性技术建议，最终由用户／ChatGPT确认。**依据不是原作者对云开发的评价，而是本轮亲自验证了后端、迁移、存储和原订单闭环；缺陷虽明显，但现在迁B会叠加平台迁移与业务重构两类风险。管理端可保留源码作为诊断入口；是否部署及暴露哪些页面应另行定范围，不自动把运营后台纳入产品。

若产品负责人明确不能承担独立服务器维护、项目长期只在微信内部使用，并愿意接受重写服务层及独立回归成本，则B值得另立验证任务。不能因为本机缺工具就默认推荐B。

工期只作审查估算：A的工程稳定与安全基线处理约5～10人日，B的平台适配额外约10～20人日；均不含已确认新业务开发、最终设计、真机资质等待和Codex-03完整验收。置信度低，不是承诺或正式排期；待缺陷拆单后重估。

## 七、修改范围与交付文件

仅新增审查文档、命令记录／清单／隔离冒烟脚本及日志。未提交node_modules、dist、微信凭据或测试数据库；未修改原业务实现、依赖版本、数据库schema或迁移。

- `docs/CODEX01_BASELINE_AUDIT_V0.1.md`：本报告。
- `DECISION_REQUEST.md`：需产品／ChatGPT决策事项。
- `docs/architecture/c01-run.mjs`、`bin/pnpm.cmd`、`bin/pnpm`：固定包管理器与完整stdout／stderr记录，兼容PowerShell和Git Bash。
- `docs/architecture/c01-inventory.mjs`：静态代码和依赖许可索引。
- `docs/architecture/c01-mysql.ps1`：本机隔离数据库环境脚本，含路径说明；不是生产部署工具。
- `docs/architecture/c01-admin-smoke.cjs`：原管理端登录页浏览器观察。
- `docs/architecture/c01-api-smoke.mjs`：仅原后端本机冒烟，脱敏Token；不是Codex-03的统一验收框架。
- `docs/audit-logs/`：原始日志、各命令结果JSON、依赖与源码清单、浏览器／HTTP观察。

仓库外临时文件位于工作区`.c01-tools`，含官方下载ZIP、解压工具、两个测试数据库、MinIO测试对象；ASCII junction位于本任务允许的可视化目录。未加入Git、未向外分发。失败库保留不删除。

交付前已停止本次后端／小程序watch／管理端，以及隔离MySQL与MinIO；停止证据见69-cleanup.json和服务终止日志。测试数据与下载包保留。所有真实平台凭据均未取得、未写入报告。

## 八、执行命令、结果和复现说明

常规可用环境先`git clone`指定仓库，再`git switch -c codex/01-baseline-audit 572f3e20fb2c2ae243013c0bdc3e05054c708745`，不要跟随上游移动的HEAD。

关键命令如下。完整精确参数、绝对cwd、Node路径、时间及退出码见同名JSON；不能用本节摘要代替原始日志。

```powershell
git clone https://github.com/llgululu/family-kitchen.git family-kitchen-c01
git rev-parse HEAD
git switch -c codex/01-baseline-audit
pnpm install --frozen-lockfile
pnpm --filter @family-kitchen/shared build
pnpm --filter @family-kitchen/backend db:generate
pnpm --filter @family-kitchen/backend exec prisma validate
pnpm --filter @family-kitchen/backend build
pnpm --filter @family-kitchen/mini-app build
pnpm --filter @family-kitchen/admin build
pnpm --filter @family-kitchen/backend db:migrate
pnpm --filter @family-kitchen/backend db:migrate:deploy
pnpm --filter @family-kitchen/backend exec prisma db seed
pnpm --filter @family-kitchen/backend exec prisma migrate status
pnpm --filter @family-kitchen/backend start
pnpm --filter @family-kitchen/mini-app dev
pnpm --filter @family-kitchen/admin run dev --host 127.0.0.1 --port 33317 --strictPort
pnpm --filter @family-kitchen/backend run test --runInBand
pnpm --filter @family-kitchen/backend test:e2e
pnpm --filter @family-kitchen/admin test
pnpm --filter @family-kitchen/shared test
pnpm --filter @family-kitchen/mini-app test
pnpm lint
pnpm --filter @family-kitchen/backend lint
pnpm --filter @family-kitchen/admin lint
pnpm --filter @family-kitchen/mini-app lint
pnpm typecheck
pnpm build
pnpm test
pnpm gen:api-types
pnpm --filter @family-kitchen/backend openapi:export
pnpm audit --json
pnpm audit --prod --json
pnpm --filter @family-kitchen/backend exec prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script
node docs/architecture/c01-inventory.mjs
node docs/architecture/c01-admin-smoke.cjs
node docs/architecture/c01-api-smoke.mjs
```

本机没有可直接用的npm；首次通过`pnpm dlx pnpm@9.12.0`取得指定版本，之后`C01_PNPM_CLI`指向其`bin/pnpm.cjs`，审查PATH首项为`docs/architecture/bin`。通过`node docs/architecture/c01-run.mjs <日志名> <秒数> <pnpm参数>`执行，避免根脚本再次调用宿主pnpm11。

本机MySQL环境：官方`https://cdn.mysql.com/Downloads/MySQL-8.4/mysql-8.4.10-winx64.zip`，SHA256=`3B950DB31C33FB59252568C012BD9EE5FAC50811E778CA7C8F1A0DC91686CD6F`。MinIO官方`https://dl.min.io/server/minio/release/windows-amd64/minio.exe`，SHA256=`AF709E6BA68488404E85ACDD22A3030D0F5E56A108D4B27D744F18CEB50861B4`。哈希是本机取得内容的证据，不冒充独立官方签名验证。

Windows本机初始化命令为`mysqld --no-defaults --initialize-insecure --basedir=<工具目录> --datadir=<全新隔离目录> --console`，初始化无监听；随后通过ASCII目录别名启动，限定`--bind-address=127.0.0.1 --port=33316 --mysqlx=OFF`，立即设本地测试密码。首次120秒预算不足时不强行migrate resolve或改SQL；新库重放并保留原失败证据。当前验证不得在真实数据库直接复跑这些建库／种子命令。

MinIO仅`server <新测试对象目录> --address 127.0.0.1:33319 --console-address 127.0.0.1:33320`。浏览器脚本需将`C01_PLAYWRIGHT_PATH`设为本机Playwright模块并有Chrome；记录器不自动安装浏览器。

## 九、需要产品负责人决定或提供

见根`DECISION_REQUEST.md`：评价粒度、多餐并行预约、菜单外价格和份量计价、异常／撤回规则、架构选择。不得再次把已经确认的无余额／默认1／送达时机列成未决问题。

微信运行环境是剩余真实阻塞：

1. 安装微信开发者工具，使用产品负责人自有小程序AppID，给验证人员开发者权限；不要继续使用仓库原作者AppID。
2. 将`mini-app/dist/build/mp-weixin`导入工具，配置可被手机访问的测试HTTPS API和图片域名，按平台要求配置合法域名。手机localhost不是本机服务器。
3. AppSecret只通过本地环境或安全配置注入后端，勿发聊天或提交Git；准备可用订阅消息模板与体验成员。
4. 安排夫妻两个微信账号、至少目标iOS／Android设备，验证登录、权限、授权拒绝、通知到达、断网和回流。切CloudBase也不能跳过这些平台前提。

## 十、协作与下一步

- Codex-02：以同一上游哈希盘点上述前端候选；重点核对原角色选择、十态按钮、爱心币和复杂模块依赖；按前端任务单提改动，不改本报告冻结的上游基线。
- Codex-03：独立干净检出同一哈希，复现安装／生成Client／迁移／构建，审查本报告和日志；重点复现后台TS错误、5个失败套件、Lint／typecheck假绿、匿名图访问、并发状态、固定角色与通知缺口。最终验收结论由Codex-03出具。
- 不合并、不推送、不部署。下一阶段须由ChatGPT发布正式任务单，不能因为本轮跑通原版就提前开发亲亲／调整模型。

当前状态：审查可执行部分已完成；微信真机与平台验证受环境阻塞，不能进入上线验收。
对应分支：codex/01-baseline-audit。
对应上游提交：572f3e20fb2c2ae243013c0bdc3e05054c708745。
构建结果：shared／backend／mini-app成功；admin／根build失败。
测试结果：后端102通过46失败；原HTTP冒烟完成；微信真机未验证。
待决策项：见DECISION_REQUEST.md。
需要其他员工配合：Codex-02前端盘点；Codex-03独立复现和验收。
下一步建议：提供微信验证环境，并由ChatGPT拆分工程与安全修复任务；不直接进入正式业务开发。
