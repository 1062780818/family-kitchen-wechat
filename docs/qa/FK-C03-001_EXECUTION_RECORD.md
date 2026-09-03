# FK-C03-001：实际执行记录

执行人：Codex-03。执行日期：2026-09-03 至 2026-09-04，Asia/Shanghai。

## 任务范围与实际产物

本轮完成 QA 框架、92 条业务用例、18 条安全检查、缺陷等级/报告模板、自动化与真机边界、门禁草案、11 项决策请求、基线待复现记录，以及可运行的只读文档检查器。没有修改任何业务文件或主仓库配置，没有运行候选业务测试，没有对开源基线出具 PASS。

全部产物位于独立工作树 `H:\codex\林家餐厅小程序\family-kitchen-c03`，分支 `codex/03-qa-framework`。本轮交付 Commit 请取最终聊天记录或此路径的 Git 历史，不在提交内写自身哈希。没有 push、合并或创建远端 PR。

## 环境实测

| 项目 | 实际结果 |
| --- | --- |
| OS | Microsoft Windows 10.0.19045；PowerShell PSEdition Core，Platform Win32NT |
| PowerShell | 7.6.4 |
| Git | git version 2.53.0.windows.3 |
| QA 脚本额外依赖 | 无；要求 PowerShell 7+ |
| 候选业务运行时/数据库/微信工具 | 未检查安装或执行，NOT_RUN |
| 微信真机 | 未连接/执行，NOT_RUN |

## 仓库缺失、发现与解除记录

1. 首次 `Get-ChildItem -Force` 只发现启动文件。`git status --short --branch` 返回 `fatal: not a git repository (or any of the parent directories): .git`。没有在这个空工作区根目录执行 `git init`。
2. 随后的 2026-09-03 23:59:45 +08:00 复查发现其他员工新建的 `family-kitchen` 与 `family-kitchen-c01` 子目录。根目录仍不是 Git 仓库（`git rev-parse --show-toplevel` 原始退出码 128）。
3. 初读子仓库时 Git 报 dubious ownership。确认这是当前授权工作区的具体项目路径后，仅在相应命令使用精确路径 `-c safe.directory=H:/codex/林家餐厅小程序/family-kitchen`（以及只读查看 C01 时的对应路径），未写全局 safe.directory，也未信任通配路径。
4. 只读确认 `family-kitchen` 的 origin 为 `https://github.com/llgululu/family-kitchen.git`，HEAD 为 `572f3e20fb2c2ae243013c0bdc3e05054c708745`，当前为 `codex/02-frontend-audit` 且有他人的 `docs/frontend/` 未跟踪文件。C01 目录在 `codex/01-baseline-audit`，有其生成类型文件及审查文档的未提交改动。未修改、暂存或恢复这些文件。
5. 以下命令实际成功，退出码 0：

```powershell
git -c 'safe.directory=H:/codex/林家餐厅小程序/family-kitchen' -C .\family-kitchen worktree add -b codex/03-qa-framework 'H:/codex/林家餐厅小程序/family-kitchen-c03' 572f3e20fb2c2ae243013c0bdc3e05054c708745
```

实际输出：

```text
Preparing worktree (new branch 'codex/03-qa-framework')
HEAD is now at 572f3e2 Update manifest.json
```

6. 将本轮自行新建的 QA 文件通过补丁迁移到该工作树；没有采用 01/02 的现成依赖目录，也没有复制未提交业务改动。2026-09-04 00:02:12 +08:00 实查工作树为 `H:/codex/林家餐厅小程序/family-kitchen-c03`，分支为 `codex/03-qa-framework`。
7. 上述父基点仅用于提交 QA 文档，不能当作已收到 Codex-01 正式固定验收版本或已执行独立复现。环境阻塞中的“本轮没有 Git 仓库”已经解除；固定版本的正式交接与业务运行环境仍待后续提供。

## 脚本执行与结果

最初尝试：

```powershell
powershell.exe -NoProfile -File .\tests\qa\Test-QaFramework.ps1 -SelfTest
```

实际结果：系统拒绝运行脚本，命令退出码 1，`running scripts is disabled on this system`，类别 `SecurityError` / `UnauthorizedAccess`。本次并未执行脚本，不记为自检成功。

使用已安装的 PowerShell 7，仅为当前进程设置执行策略后执行已审查的只读脚本。未调用 Set-ExecutionPolicy，未修改机器或用户持久化策略。后续检查 PowerShell 7 策略：MachinePolicy/UserPolicy/Process/CurrentUser 为 Undefined，LocalMachine 为 RemoteSigned；没有组织强制策略需要绕过。

在最终 QA 工作树复跑的命令：

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\tests\qa\Test-QaFramework.ps1 -SelfTest
```

实际退出码：0。完整输出：

```text
文档结构自检通过：11 个章节，L0-L7，92 条业务用例，18 条安全检查，11 个决策引用。
检查器自测试通过（成功拒绝）：缺失章节
检查器自测试通过（成功拒绝）：缺失用例
检查器自测试通过（成功拒绝）：重复用例
检查器自测试通过（成功拒绝）：空预期列
检查器自测试通过（成功拒绝）：缺执行状态
检查器自测试通过（成功拒绝）：缺失层级
检查器自测试通过（成功拒绝）：未知用例
检查器自测试通过（成功拒绝）：缺失安全检查
检查器自测试通过：1 份有效输入，8 份内存反例；未生成测试业务数据或修改文件。
边界：本结果只验证 QA 文档结构；业务、基线构建、安全与真机测试均未执行。
```

此前在迁移前目录和最终 QA 工作树也实际执行不带 `-SelfTest` 的正常检查，退出码均为 0。缺文件负例命令以不存在的 `__missing_framework__.md` 为输入，输出“找不到 QA 文档”，脚本原始退出码 2（已通过 `$LASTEXITCODE` 核实），符合设计，未创建该文件。

暂存差异检查最初检出主文档 Markdown 硬换行使用的行尾空格；已改为段落空行，不修改 Git 空白检查配置。只暂存本轮列出的 5 个 QA 文件。Git 原配置的 LF/CRLF 转换提示保留，未更改全局或仓库换行设置。提交作者若无已配置身份，使用命令级 `Codex-03 <codex-03@localhost>` 标明本地 QA 作者，不冒用产品负责人身份或修改持久化用户设置。

测试解释：1 份有效输入检查成功，8 类内存反例被拒绝，缺文件错误路径返回 2；这些是 QA 检查器的自测试，不是 92 条业务用例或 18 条安全检查已经通过。结构检查不评估业务语义、运行环境、许可证或真机质量。

## 已知问题、待决策及后续交接

- 未对业务运行时、依赖、各端构建、数据库、安全及真机作实测；各项 NOT_RUN，无业务验收结论。
- 11 项未决问题位于 `DECISION_REQUEST.md`，不能为了测试通过擅自选择答案。
- 已建立 QA 工作树，但没有收到 Codex-01 固定版本和完整运行证据的正式交接；不替其决定正式验收版本。
- 下一步由用户/ChatGPT 安排接收本 QA 提交；01 提供固定基线/运行步骤/隔离环境，02 提供前端盘点，然后 03 独立复现和按阶段验收。

文件清单：主框架、决策请求、待复现报告、本执行记录、`tests/qa/Test-QaFramework.ps1`；均为 QA 所有目录及任务明确授权的主文档路径。
