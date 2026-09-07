#Requires -Version 7.0
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidatePattern('^[a-z0-9-]+$')][string]$Name,
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter()][string]$ArgumentsJson = '[]',
    [Parameter(Mandatory = $true)][string]$WorkingDirectory,
    [Parameter(Mandatory = $true)][string]$EvidenceDirectory
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$startedAt = Get-Date
New-Item -ItemType Directory -Force -Path $EvidenceDirectory | Out-Null
$logPath = Join-Path $EvidenceDirectory "$Name.log"
$jsonPath = Join-Path $EvidenceDirectory "$Name.json"
$ArgumentList = @($ArgumentsJson | ConvertFrom-Json)

Push-Location -LiteralPath $WorkingDirectory
try {
    $output = @(& $FilePath @ArgumentList 2>&1 | ForEach-Object { "$_" })
    $exitCode = $LASTEXITCODE
}
catch {
    $output = @("runner exception: $($_.Exception.Message)")
    $exitCode = 9001
}
finally {
    Pop-Location
}

$finishedAt = Get-Date
$output | Set-Content -Encoding utf8 -LiteralPath $logPath
[ordered]@{
    name = $Name
    filePath = $FilePath
    arguments = $ArgumentList
    workingDirectory = $WorkingDirectory
    startedAt = $startedAt.ToString('o')
    finishedAt = $finishedAt.ToString('o')
    durationMs = [math]::Round(($finishedAt - $startedAt).TotalMilliseconds)
    exitCode = $exitCode
    logPath = $logPath
} | ConvertTo-Json -Depth 4 | Set-Content -Encoding utf8 -LiteralPath $jsonPath

$output | Select-Object -Last 80 | Write-Output
Write-Output "C03_EVIDENCE name=$Name exit=$exitCode log=$logPath"
exit $exitCode
