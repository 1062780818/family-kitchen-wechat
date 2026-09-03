# 基线独立复现报告 V0.1

任务：FK-C03-001；责任人：Codex-03；日期：2026-09-03～2026-09-04。

## 当前结论

对 Codex-01 报告的复现验收结论：**CONDITIONAL PASS**。在全新克隆、独立 `node_modules` 和独立数据库/对象存储数据目录中，Codex-03 复现了固定提交、冻结安装、共享包/后端/小程序构建、管理端构建失败、Lint失败、类型检查假绿边界、测试失败统计、迁移/种子、三端启动、数据库连接以及对象存储公开读取。Codex-01 的核心技术结论与实际结果一致，未发现其把失败写成成功。

条件与未覆盖：未复跑其全部 27 项 HTTP 冒烟、全量依赖安全通告及每一份日志，也没有微信开发者工具、自有 AppID 或真机。本结论只认可其“基线是有条件复用候选、不能原样上线”的审查结论，不认可原产品可发布，也不表示未来家庭点菜需求已经实现。作为当前产品发布候选的门禁结论仍为 **FAIL**：管理端生产构建、根 Lint/测试和 46 项后端测试失败，微信真机及新业务均未通过。

## 追溯信息

| 项目 | 实际值 |
| --- | --- |
| 候选上游标识 | llgululu/family-kitchen（尚未正式交接固定验收版本） |
| 本地 origin | https://github.com/llgululu/family-kitchen.git；后续正式集成目标待 01 明确 |
| Codex-01 交付 Commit | 4b5a6c54897bb4a758e1586f49211b08ea627d3f |
| 固定上游分支/Commit | main / 572f3e20fb2c2ae243013c0bdc3e05054c708745 |
| 本地 QA 目录 | H:\codex\林家餐厅小程序\family-kitchen-c03 |
| 本地 Git 状态 | 初查工作区根目录无仓库；后发现子仓库，已建立独立 QA 工作树 |
| QA 分支/Commit | codex/03-qa-framework；实际 QA 文档 Commit 在最终聊天交付中列出 |
| QA 文档父基点 | 572f3e20fb2c2ae243013c0bdc3e05054c708745；不是指定复现版本的正式交接 |
| 已读 Codex-01 报告 | docs/CODEX01_BASELINE_AUDIT_V0.1.md（从交付 Commit 读取） |
| 是否复用 01 的依赖安装目录 | 否；在全新克隆中独立安装 |
| 实际独立运行环境 | family-kitchen-c03-repro；独立安装1554包；本地独立 MySQL 8.4.10 数据目录与 MinIO 数据目录 |

## 各模块实测状态

| 对象 | 获取/安装 | 构建/启动 | 数据/连接 | 与 01 的比较 |
| --- | --- | --- | --- | --- |
| 小程序 | PASS：独立安装 | 生产构建成功；dev 编译成功进入 watch | 未做微信平台连接 | 与01一致 |
| 后端 | PASS：Client生成、build成功 | 服务启动；health=ok | db=ok，实测延迟1ms | 与01一致 |
| 管理后台 | PASS：独立安装 | 生产构建失败；dev HTTP 200 | 登录页HTML可返回，未测后台业务 | 与01一致 |
| 数据库/存储/规则 | 13迁移、seed成功 | schema up to date；MinIO启动成功 | 匿名默认头像 HTTP 200 | 与01一致，公开读风险重现 |
| 许可证/依赖元数据 | 根MIT独立阅读；工作区无覆盖LICENSE；pnpm许可证列表17类 | 未复跑audit通告 | exif-parser元数据缺许可、实际LICENSE.md为MIT | 关键结论一致，非全量独立复核 |

## 关键命令结果

- `pnpm@9.12.0 install --frozen-lockfile`：退出0，1554包，约1分43秒；锁文件未改。未使用01的node_modules；新建独立store。
- shared build、Prisma Client生成、后端build、小程序生产build：均退出0。
- 管理端生产build：退出1，实际出现18条TypeScript诊断；主要包括Axios响应取值、未使用导入、可空类型、TabPaneName签名和unplugin/webpack声明问题。与01一致。
- Prisma validate：未设DATABASE_URL时退出1（P1012）；补入独立测试URL后退出0。这是运行前置条件验证，不是源码不一致。
- 根Lint：退出1，shared缺ESLint9 flat config；与01一致。
- 根typecheck：退出0，但mini-app明确只是echo；管理端build仍失败，确认该命令不能作为全仓类型安全证据。
- 根test：退出1，admin无测试文件；shared与mini-app仅echo。后端使用 `pnpm ... exec jest --runInBand` 单独执行：23套件中18通过、5失败，148用例中102通过、46失败；与01完全一致。前两次错误命令分别造成“模式参数被当作测试名”和pnpm未知选项，均未作为产品结果，正确命令后重跑。
- 独立MySQL全新库：13迁移全部成功，seed成功，状态up to date；数据包含原项目爱心币/徽章等，仅为基线数据，不表示符合新需求。
- 后端：HTTP与WS进程启动；`/api/v1/health`=ok，`/api/v1/health/db`=ok。
- 管理端dev：Vite 5.4.21启动，HTTP 200且HTML含title；小程序dev完成编译并进入watch。二者验证后停止。
- 对象存储：MinIO独立数据目录启动；后端创建桶并播种默认头像。匿名GET返回200 image/jpeg；未登录upload返回401，确认公开读取风险与上传鉴权同时存在。
- 全部本轮服务和33326～33330、33337端口已停止，复查均未监听。

独立复现产生的 `admin/src/auto-imports.d.ts` 与 `admin/src/components.d.ts` 自动改动仅留在隔离复现目录，没有提交到QA分支或其他员工分支。

## 对照、缺陷与结论边界

- 一致：固定Commit、安装包数、shared/backend/mini构建、admin构建失败、根Lint/test、typecheck假绿、后端102/46统计、13迁移/seed、三端可启动和公开图片风险。
- 可解释差异：首次无DATABASE_URL的validate失败；补齐独立测试环境后成功。01也记录配置前提，非报告矛盾。
- 未覆盖：完整HTTP业务冒烟、跨家庭接口、并发状态、全量audit可达性、schema drift、微信通知/真机。因此不签PASS。
- 基线阻断：L1与L6未通过；L3只验证原项目局部基础链路；固定夫妻角色、目标四态、调整确认及独立亲亲机制并不存在，不能原样发布。
- 严重度：管理端正式构建/根门禁/测试债按发布范围至少构成S1阻断；公开图片是否允许须按家庭隐私规则修复并安全复验。这里只记录基线风险，不替开发员工修改。

待后续提供：产品负责人自有微信平台测试条件和正式集成远程仓库；未来业务契约冻结后再执行92条矩阵。不得在聊天或仓库交接秘密。

## 复现记录模板

```text
仓库 URL / 分支 / 完整 Commit / 工作区状态：
独立目录 / 缓存策略 / 环境与配置版本 / 执行人和时间：
模块 / 步骤 / 命令 / 退出码 / 产物哈希：
Codex-01 原结论及证据：
Codex-03 实际结果及证据：
一致项 / 不一致项 / 根因是否已确定：
缺陷及严重等级 / 环境阻塞 / 适配缺口 / NA 审核依据：
原始失败与环境补丁后的结果（分别记录）：
验收范围 / 未覆盖项 / 结论 / 条件与正式批准：
修复 Commit / 复验结果及证据：
```
