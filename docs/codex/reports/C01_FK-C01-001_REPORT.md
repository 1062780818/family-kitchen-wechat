# C01｜FK-C01-001 第0阶段基线审查报告

## 1. 交付标识

- 上游：`https://github.com/llgululu/family-kitchen.git`
- 上游分支／Commit：`main`／`572f3e20fb2c2ae243013c0bdc3e05054c708745`
- 工作分支：`codex/01-baseline-audit`
- 首轮审查提交：`4b5a6c54897bb4a758e1586f49211b08ea627d3f`
- 日期：2026-09-03至2026-09-04；Windows、Node 24.19.0、pnpm 9.12.0。
- 范围：只审查开源基线，没有开发、删除或改造正式业务功能，也没有代替C03出具验收结论。

完整调查正文保留在`docs/CODEX01_BASELINE_AUDIT_V0.1.md`，全部原始命令、标准输出、错误及退出码保留在`docs/audit-logs/`；本文件是固定协议下供ChatGPT和其他员工定位的主报告。

## 2. 真实性结论

原仓库不是README壳：冻结安装成功（1554包、锁文件未改），shared、backend及小程序微信目标构建成功；MySQL 8.4.10全新库成功执行13个迁移和原seed；Nest后端、MinIO以及27项本机HTTP观察实际跑通。小程序只证明编译和watch成功，未取得微信开发者工具、自有AppID、订阅模板及双账号真机环境，因此微信登录、通知和真机链路未验证。

管理端开发服务和登录页可打开，但生产构建有18条TypeScript诊断。后端Jest为23套件中18通过、5失败，148用例中102通过、46失败；失败集中在order、message、achievement和recipe测试的依赖注入陈旧。管理端无测试文件；shared和mini-app测试只是echo占位。根lint失败，根typecheck虽退出0但漏检管理端项目引用和小程序类型。

数据库迁移历史显示up to date，但只读diff确认当前schema与迁移结果仍有差异：`chef_level_definitions.title`长度以及`notification_log`索引名称／排序不一致。没有执行修复SQL。

## 3. 许可、依赖与安全

根许可证为MIT，必须保留`Copyright (c) 2026 GuLu`、MIT许可正文和免责条款。生成的`docs/audit-logs/38-license-inventory.json`记录1554个本机安装包的许可证元数据、文件哈希及版权摘录。Prisma／uni-app为Apache-2.0，主要Vue／Nest组件为MIT；MySQL服务端为GPLv2，MinIO服务端为AGPLv3，不能套用MinIO JS SDK的Apache许可。uCharts、exif-parser、caniuse-lite及图片素材另有署名或权属风险。

依赖扫描全图为critical 2、high 66、moderate 58、low 16；生产图为critical 1、high 43、moderate 32、low 4。通告数量不等于已证实漏洞，未执行`audit fix`。代码审查另发现公开读图片、示例管理员密码、JWT强度不足、限流守卫缺失、状态并发更新、WebSocket会话撤销不一致、微信消息环境硬编码及新餐单通知链路缺失等风险。

## 4. 复用及数据模型差距

可条件复用：仓库分层、家庭和多菜餐单基础、部分DTO／校验／异常处理、小程序菜单／菜品／订单／通知页面与公共组件。需要隐藏或后续删除：爱心币余额和账本、打赏撤销、奖励公式、等级徽章、AI菜谱、复杂消息及商业运营模块。

必须重构但本轮未实施：creator/member不能表达固定妻子点菜与丈夫做饭；Recipe缺亲亲价格、预计耗时和明确分类；Order缺日期／餐段；OrderItem缺份量、逐菜处理及价格快照；缺调整提案和妻子确认模型、采购备注、完整菜单外菜品链路、亲亲送达记录及独立状态流水。原十态、整单评价奖励和LovePointLog不能直接充当已确认的四主态及亲亲规则。

## 5. 架构比较

条件性建议优先保留NestJS＋Prisma＋MySQL核心：本轮已实测其迁移、存储和订单链路，工程及安全稳定约需5至10人日（低置信度，不含正式业务）。CloudBase可减少自建基础设施，但需重写身份映射、数据访问、事务、存储URL、通知、WebSocket／定时任务及管理端会话；预计额外10至20人日且产生平台绑定风险。若产品明确不承担独立服务运维，应由ChatGPT另立CloudBase验证任务，C01不自行冻结方案。

## 6. 证据及边界

- 运行明细：`docs/CODEX01_BASELINE_AUDIT_V0.1.md`
- 环境和命令：`docs/architecture/`、`docs/audit-logs/03-*`至`70-*`
- HTTP观察：`docs/audit-logs/61-api-smoke.json`
- 迁移差异：`docs/audit-logs/68-schema-drift.log`
- 许可清单：`docs/audit-logs/38-license-inventory.json`
- 源码清单：`docs/audit-logs/39-source-inventory.json`
- 待决策项：`docs/codex/decisions/C01_FK-C01-001_DECISIONS.md`

隔离MySQL、MinIO及前端／后端开发进程均已关闭，测试数据和下载包保留于Git外`.c01-tools`。真实密钥、数据库及用户数据均未使用或提交。当前`origin`仍是上游作者仓库；联网dry-run因没有GitHub凭据而无法推送，不能视为三名员工共同可写的远程仓库。
