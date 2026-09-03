# C01交接C03｜独立基线复现

- 分支：`codex/01-baseline-audit`
- 上游基线：`572f3e20fb2c2ae243013c0bdc3e05054c708745`
- C01首轮审查提交：`4b5a6c54897bb4a758e1586f49211b08ea627d3f`

请C03从固定基线独立复现，不能复用C01的node_modules或测试数据库。优先核对：后台18条TS诊断；后端5个失败套件／46个失败用例；lint及typecheck假绿；匿名图片读取；迁移历史与当前schema差异；跨家庭权限、状态并发、固定夫妻角色、菜单外菜品和通知缺口。微信开发者工具、自有AppID、模板及双账号真机环境未取得，C01没有给出最终验收结论。

完整命令和失败证据见`docs/CODEX01_BASELINE_AUDIT_V0.1.md`与`docs/audit-logs/`；HTTP观察见`61-api-smoke.json`，迁移差异见`68-schema-drift.log`。
