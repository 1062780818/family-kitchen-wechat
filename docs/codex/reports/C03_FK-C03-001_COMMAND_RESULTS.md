# C03｜FK-C03-001 独立复现命令结果

执行日期：2026-09-04，Asia/Shanghai。复现目录：`H:\codex\林家餐厅小程序\family-kitchen-c03-repro`；它与01/02工作树隔离，未纳入提交。

| 步骤/命令摘要 | 退出码 | 关键输出/解释 |
| --- | ---: | --- |
| git clone上游、detached checkout固定Commit | 0 | HEAD=`572f3e20fb2c2ae243013c0bdc3e05054c708745`，origin为上游URL |
| `pnpm dlx pnpm@9.12.0 --version` | 0 | 9.12.0 |
| 冻结安装，独立store | 0 | 1554包；锁文件未改；1m43.4s |
| shared build | 0 | `tsc`完成 |
| backend db:generate | 0 | Prisma Client 5.22.0生成 |
| prisma validate（未设URL） | 1 | P1012，DATABASE_URL缺失；记录前置失败 |
| prisma validate（独立测试URL） | 0 | schema valid |
| backend build | 0 | Nest build完成 |
| mini-app build | 0 | mp-weixin生产编译成功 |
| admin build | 1 | 18条TS诊断；与01一致 |
| 根lint | 1 | shared缺ESLint9 flat config；与01一致 |
| 根typecheck | 0 | mini仅echo；不能覆盖admin build失败 |
| 根test | 1 | admin无测试文件；shared/mini为echo |
| 后端Jest错误尝试1 | 1 | 多余`--`导致参数被当作测试模式；不计产品结果 |
| 后端Jest错误尝试2 | 1 | pnpm解析`--runInBand`为未知选项；不计产品结果 |
| `pnpm ... exec jest --runInBand` | 1 | 5套件失败18通过；46用例失败102通过；总148 |
| MySQL 8.4.10全新数据目录初始化 | 0 | initialize-insecure仅用于绑定127.0.0.1的短期隔离测试；结束后关闭 |
| prisma migrate deploy | 0 | 13个迁移全部应用 |
| prisma db seed | 0 | 2用户、1家庭、8菜、3订单、60徽章等原基线数据 |
| prisma migrate status | 0 | schema up to date |
| MinIO独立目录启动 | 0 | 127.0.0.1:33329；后端创建独立桶 |
| 后端启动与health | 0 | health=ok；db=ok，观察延迟1ms |
| 管理端dev | 0 | Vite5.4.21 ready；HTTP200，HTML含title |
| 小程序dev | 0 | Build complete，watch ready 5665ms |
| 匿名默认头像/未认证upload | 观察 | GET=200 image/jpeg；upload=401 |
| 服务清理 | 0 | 33326～33330、33337均无监听 |

独立许可证读验：根LICENSE为MIT，Copyright 2026 GuLu；业务工作区未发现覆盖根LICENSE。`pnpm licenses list --json`返回17类元数据：MIT 1047、Apache-2.0 96、ISC 56、BSD-3-Clause 29、BSD-2-Clause 20等；`exif-parser`包元数据无license，但实际LICENSE.md为MIT且版权为Bruno Windels/Daniel Leinich。没有把此元数据汇总当作完整律师意见或安全验收。

管理端失败类别：默认头像Axios响应属性访问4项、未使用导入、可能undefined配置、两个Tab签名不匹配，以及unimport/unplugin/webpack依赖声明错误。后端失败主要是OrderService缺NotificationService测试provider、RecipeService缺AchievementService等测试夹具与实现漂移；精确统计与01原始日志一致。

环境：Windows 10.0.19045，PowerShell 7.6.4，Git 2.53.0，Node 24.19.0，pnpm 9.12.0，Prisma Client 5.22.0，MySQL 8.4.10。运行时高于`.nvmrc`的20；这与01环境一致，不代表Node20已另测。

证据限制：本轮命令原始终端输出由任务工具产生；本文件保留完整命令级结果、退出码、关键错误和统计。01提交已含原始长日志，本轮没有复制其日志冒充独立输出，也没有提交本地测试凭据、数据库、node_modules或生成dist。
