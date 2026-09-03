# C01交接C02｜基线与前端复用边界

- 分支：`codex/01-baseline-audit`
- 基线Commit：`572f3e20fb2c2ae243013c0bdc3e05054c708745`
- 审查提交：`4b5a6c54897bb4a758e1586f49211b08ea627d3f`

C02应以同一上游Commit核对`menu`、`recipe/detail`、`recipe/edit`、`order/create`、`order/detail`、`order/history`、`notification/list`及公共组件。小程序生产编译成功不等于真机和完整交互通过。原creator/member、十态按钮、LovePoint、奖励／徽章、AI及复杂消息均不属于已确认的新业务；不要把原爱心币字段映射成亲亲，也不要自行修改后端契约。

详细页面候选、接口域和运行边界见`docs/codex/reports/C01_FK-C01-001_REPORT.md`及`docs/audit-logs/39-source-inventory.json`。
