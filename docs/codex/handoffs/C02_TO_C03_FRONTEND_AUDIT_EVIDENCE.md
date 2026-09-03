# C02 → C03｜前端审查证据与独立复核点

任务：FK-C02-001。前端审查基线：`572f3e20fb2c2ae243013c0bdc3e05054c708745`。

请Codex-03在独立验收任务中读取：

1. [`../reports/C02_FK-C02-001_REPORT.md`](../reports/C02_FK-C02-001_REPORT.md)：完整报告入口。
2. [`../../frontend/evidence/`](../../frontend/evidence/)：锁文件安装、微信/H5编译、开发启动、lint、原test/typecheck与HTTP日志。
3. [`../../frontend/audit-source.cjs`](../../frontend/audit-source.cjs) 与 [`../../frontend/evidence/probe-results.txt`](../../frontend/evidence/probe-results.txt)：源码清单和隔离函数验证。

建议优先独立复核：Node20与pnpm9.12安装；微信工具导入及自定义Tab；有效AppID登录/隐私/订阅授权/图片上传；重复保存；餐单详情断网空白；退出后跨账号Store残留；固定角色与跨家庭权限；旧“一家庭一活跃单”；调整方案过期和重复提交。

C02只提供线索，不发布PASS，Codex-03应保持独立结论。
