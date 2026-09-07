# C03 当前状态

- 任务：`FK-C03-001`；第0阶段框架与固定基线独立复现均已完成，不进入正式业务开发。
- 分支：`codex/03-qa-framework`。
- 已完成成果Commit：`bca23bbda7de3dbc1e16823cd224fc1a3f1fbd1d`；本状态更新的最新Commit以本文件所在分支HEAD为准。
- 详细报告：`docs/codex/reports/C03_FK-C03-001_REPORT.md`。
- 验收矩阵：`docs/CODEX03_QA_FRAMEWORK_V0.1.md`（L0～L7、92条业务用例、18条安全检查）。
- 给C01的handoff：`docs/codex/handoffs/C03_TO_C01_QA_FRAMEWORK.md`。
- 给C02的handoff：`docs/codex/handoffs/C03_TO_C02_QA_FRAMEWORK.md`。

## 需要C01读取

1. 对C01基线报告的复现结论为`CONDITIONAL PASS`；对当前代码作为发布候选的门禁结论为`FAIL`，两者范围不同。
2. 管理端生产构建、根Lint/测试、后端46项失败测试、typecheck漏检和匿名图片读取风险必须进入后续修复/复验安排。
3. C01后续集成时读取本状态、详细报告、独立复现报告和handoff；不要求用户搬运技术内容。

## 微信真机验收条件

- 产品负责人自有小程序AppID及开发者权限、体验成员；AppSecret只安全注入服务端，不进入Git或聊天。
- 微信开发者工具、可被真机访问的测试HTTPS API/图片合法域名及适用订阅消息模板。
- 两个独立测试微信身份、目标iOS/Android设备；覆盖登录、角色/家庭隔离、授权拒绝、通知、断网与回流。

微信条件不阻断本次第0阶段成果推送。当前`origin`为项目共享仓库，`upstream`为原作者仓库；推送前按FK-ALL-003等待并获取`origin/main`。
