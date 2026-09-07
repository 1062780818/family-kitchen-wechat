# C01→C03｜FK-C01-007独立复验交接

> 写入仓库不等于C03已启动。需由外部正式启动C03。C01结论仅为“修复待复验”。

## 固定输入

- 分支：`codex/01-security-closeout-007`
- 固定代码提交：`cce4cbd35adb0658376b1be6120ccf1e61ece646`
- 输入业务提交：`b22ee29634c7187281bfe2beb3672eb29a3a4bc0`
- 输入证据提交：`2261ccddc51ade24203273ebb78fe06863ab5c3d`
- 详细报告：`docs/codex/reports/C01_FK-C01-007_FIX_REPORT.md`
- 认证范围决定：`docs/codex/decisions/FK_AUTH_ENTRY_SCOPE_V0.1.md`

## 缺陷与修复位置

| 原编号             | 根因                                                 | 主要修复位置                                                      | C01状态                    |
| ------------------ | ---------------------------------------------------- | ----------------------------------------------------------------- | -------------------------- |
| `FK-C03-004-01` S1 | pnpm字面量`--`被位置参数当成备份路径；环境入口不明确 | `backend/src/scripts/migrate-storage-refs.ts`、FK-C01-006命令文档 | 已修复待复验               |
| `FK-C03-004-02` S1 | 管理员缺配置回退固定默认凭据；守卫未检查入口配置     | `backend/src/config/*`、`auth.service.ts`、`admin.guard.ts`       | 已修复待复验               |
| `FK-C03-003-04` S2 | 生产密码注册/登录仍开放且客户端暴露                  | 后端认证服务/环境校验；小程序API、store、login页                  | 已修复待复验               |
| `FK-C03-004-03` S2 | 漏计vite基础设施2错及相邻保留5错                     | `mini-app/vite.config.js`、guest/family页面、门禁脚本             | 7错已修，剩余3错待核实归属 |

## 环境要求

- Node v24.19.0（或满足项目>=18约束的受支持版本）、pnpm严格9.12.0。
- 全新工作目录，无 `node_modules`、Prisma生成物和旧构建物。
- 隔离MySQL 8.4.x、隔离MinIO；只使用虚构家庭、用户和测试图片。
- 迁移env文件与备份目录必须是仓库外绝对路径；备份目标首次执行前不存在。
- 不连接生产数据库/存储，不公开部署，不放入真实凭据。

## 一键门禁

```powershell
pnpm run verify:retained:clean
```

预期：固定pnpm安装→Prisma生成→共享包→后端保留范围→小程序保留范围和构建全部退出0；后端110/110、小程序5/5、共享包1/1。安装入口已串行生命周期钩子，避免Windows非交互runner的pnpm 9 `readStream`失败。

## 迁移S1实际命令

```powershell
pnpm --filter @family-kitchen/backend run storage:refs:preview --env-file="<absolute-test-env-file>"
pnpm --filter @family-kitchen/backend run storage:refs:apply --env-file="<absolute-test-env-file>" --backup="<absolute-new-backup.json>"
pnpm --filter @family-kitchen/backend run storage:refs:rollback --env-file="<absolute-test-env-file>" --backup="<absolute-backup.json>"
```

请独立断言：

1. preview不改库；apply前目标不存在，apply后该精确路径存在且JSON `version=1`，数据库才改变。
2. 指定路径、命令输出路径、rollback读取路径三者完全一致；仓库/公开资源目录没有备份。
3. apply后preview为0；重复apply使用新备份并应用0条；对应rollback恢复0条。
4. 原始apply备份能恢复旧值；当前值被再次编辑后rollback应拒绝。
5. 原C03调用形式（字面量`--`）、相对路径、缺失/未知/重复参数、无效父目录、已有备份均失败且数据库不变。
6. 只转换能通过MinIO存在性、服务origin、family/category/owner校验的记录；不抓外部URL、不猜家庭。

## 管理员S1与密码入口S2

定向脚本：

```powershell
node tests/integration/security-closeout-regression.mjs
```

脚本通过环境变量指定隔离API、JWT测试密钥及disabled/enabled模式；不得把测试密钥写入仓库或报告。请独立覆盖：

- `ADMIN_ENABLED=false`，配置缺失、空、部分配置、旧默认值：不能取得管理员令牌或访问任一管理接口；关闭时核心后端可启动。
- 有效显式配置：正确测试凭据可用；旧默认凭据、错误凭据、另一管理员身份令牌拒绝。
- 生产密码入口403；生产设置 `PASSWORD_LOGIN_ENABLED=true` 启动退出1；非生产只有显式开关才允许测试身份。
- 小程序/H5构建产物及源代码不再暴露密码注册/登录调用；这不等于微信登录已验证。

## 受影响回归

```powershell
node tests/integration/foundation-defect-regression.mjs
pnpm --filter @family-kitchen/backend run test --runInBand
pnpm --filter @family-kitchen/mini-app run lint
```

预期：真实MySQL/MinIO基础回归19/19；并发和图片两个旧S1不回退。全后端的期望不是全绿：C01实测160/179，19失败、0跳过（消息11、成就8）。小程序全量Lint实测3 errors/1458 warnings、0跳过，剩余为AI 2、复杂聊天1。请保留并核实这些失败，不放宽断言或关闭规则。

## 独立验收停止条件

C03应独立决定缺陷CLOSED或继续OPEN。真实微信身份、通知、真机、生产发布和真实数据迁移均不在本交接的通过声明中。
