#Requires -Version 7.0
[CmdletBinding()]
param(
    [string]$DocumentPath = (Join-Path $PSScriptRoot '../../docs/CODEX03_QA_FRAMEWORK_V0.1.md'),
    [switch]$SelfTest
)

# 只读文档结构检查；不是业务测试、许可证检查或产品发布门禁执行器。
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-QaFrameworkErrors {
    param([Parameter(Mandatory = $true)][string]$Text)

    $issues = [System.Collections.Generic.List[string]]::new()
    $sections = @(
        '一、验收层级', '二、基线复现步骤', '三、业务验收矩阵',
        '四、安全检查表', '五、缺陷等级和模板', '六、自动化测试建议',
        '七、人工真机测试建议', '八、发布门禁草案', '九、修改文件列表',
        '十、当前等待 Codex-01 提供的内容', '十一、需要产品负责人决定的问题'
    )
    foreach ($section in $sections) {
        $pattern = '(?m)^## ' + [regex]::Escape($section) + '\s*$'
        if ([regex]::Matches($Text, $pattern).Count -ne 1) {
            $issues.Add("交付章节缺失或重复：$section")
        }
    }
    for ($level = 0; $level -le 7; $level++) {
        if ([regex]::Matches($Text, "(?m)^\| L$level \|").Count -ne 1) {
            $issues.Add("验收层级缺失或重复：L$level")
        }
    }

    $categoryCounts = [ordered]@{
        FAM = 8; DISH = 10; ORDER = 13; ADJ = 13; STATE = 10
        KISS = 10; OFF = 8; NOTICE = 7; REVIEW = 3; SEC = 18
    }
    $expectedIds = [System.Collections.Generic.List[string]]::new()
    foreach ($category in $categoryCounts.Keys) {
        for ($number = 1; $number -le $categoryCounts[$category]; $number++) {
            $id = '{0}-{1:D2}' -f $category, $number
            $expectedIds.Add($id)
            $pattern = '(?m)^\| ' + [regex]::Escape($id) + ' \|[^\r\n]*$'
            $rows = [regex]::Matches($Text, $pattern)
            if ($rows.Count -ne 1) {
                $issues.Add("用例/检查 ID 缺失或重复：$id")
                continue
            }
            $cells = @($rows[0].Value.Trim().Trim('|').Split('|') | ForEach-Object { $_.Trim() })
            $expectedCells = if ($category -eq 'SEC') { 4 } else { 5 }
            if ($cells.Count -ne $expectedCells) {
                $issues.Add("用例列数异常：$id")
            }
            if (@($cells | Where-Object { [string]::IsNullOrWhiteSpace($_) }).Count -gt 0) {
                $issues.Add("用例存在空列（含动作/预期/方法）：$id")
            }
        }
    }
    foreach ($row in [regex]::Matches($Text, '(?m)^\| ((?:FAM|DISH|ORDER|ADJ|STATE|KISS|OFF|NOTICE|REVIEW|SEC)-\d+) \|')) {
        if (-not $expectedIds.Contains($row.Groups[1].Value)) {
            $issues.Add("出现未登记用例 ID，请同步检查器：$($row.Groups[1].Value)")
        }
    }
    for ($decision = 1; $decision -le 11; $decision++) {
        $id = 'DR-{0:D2}' -f $decision
        if (-not $Text.Contains($id)) { $issues.Add("未包含决策引用：$id") }
    }
    foreach ($marker in @(
        '全部业务与安全用例为 NOT_RUN', 'BLOCKED_DECISION',
        '业务用例尚未执行', 'S0=0', 'S1=0',
        'PASS / CONDITIONAL PASS / FAIL', '不能证明用例语义正确'
    )) {
        if (-not $Text.Contains($marker)) { $issues.Add("缺少阶段/证据边界声明：$marker") }
    }
    # 此版本为固定的第 0 阶段快照；进展变化时应更新文档和检查器，而非伪造状态。
    return $issues.ToArray()
}

try {
    if (-not (Test-Path -LiteralPath $DocumentPath -PathType Leaf)) {
        throw "找不到 QA 文档：$DocumentPath"
    }
    $qaText = Get-Content -Raw -Encoding UTF8 -LiteralPath $DocumentPath
    $qaErrors = @(Get-QaFrameworkErrors -Text $qaText)
    if ($qaErrors.Count -gt 0) {
        foreach ($issue in $qaErrors) { Write-Output "结构错误：$issue" }
        exit 1
    }
    Write-Output '文档结构自检通过：11 个章节，L0-L7，92 条业务用例，18 条安全检查，11 个决策引用。'

    if ($SelfTest) {
        $faults = [ordered]@{
            '缺失章节' = $qaText.Replace('## 八、发布门禁草案', '## 被移除的章节')
            '缺失用例' = [regex]::Replace($qaText, '(?m)^\| ORDER-07 \|[^\r\n]*\r?\n', '')
            '重复用例' = $qaText + "`n| KISS-05 | 测试 | 测试 | 测试 | 测试 |`n"
            '空预期列' = [regex]::Replace($qaText, '(?m)^\| KISS-04 \|[^\r\n]*', '| KISS-04 | R11/P0 | 动作 | | 接口/01 |')
            '缺执行状态' = $qaText.Replace('全部业务与安全用例为 NOT_RUN', '删除状态')
            '缺失层级' = [regex]::Replace($qaText, '(?m)^\| L4 \|[^\r\n]*\r?\n', '')
            '未知用例' = $qaText + "`n| FAM-99 | 测试 | 测试 | 测试 | 测试 |`n"
            '缺失安全检查' = [regex]::Replace($qaText, '(?m)^\| SEC-12 \|[^\r\n]*\r?\n', '')
        }
        foreach ($fault in $faults.Keys) {
            if (@(Get-QaFrameworkErrors -Text $faults[$fault]).Count -eq 0) {
                throw "检查器自测试失败，未发现故意植入的问题：$fault"
            }
            Write-Output "检查器自测试通过（成功拒绝）：$fault"
        }
        Write-Output '检查器自测试通过：1 份有效输入，8 份内存反例；未生成测试业务数据或修改文件。'
    }
    Write-Output '边界：本结果只验证 QA 文档结构；业务、基线构建、安全与真机测试均未执行。'
    exit 0
}
catch {
    Write-Output "检查器执行失败：$($_.Exception.Message)"
    exit 2
}
