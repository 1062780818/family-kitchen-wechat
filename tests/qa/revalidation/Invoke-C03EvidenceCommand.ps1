[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Name,
  [Parameter(Mandatory = $true)][string]$Command,
  [Parameter(Mandatory = $true)][string]$EvidenceDirectory
)

$ErrorActionPreference = 'Continue'
$directory = [System.IO.Path]::GetFullPath($EvidenceDirectory)
[System.IO.Directory]::CreateDirectory($directory) | Out-Null
$logPath = Join-Path $directory "$Name.log"
$metadataPath = Join-Path $directory "$Name.json"
$startedAt = [DateTimeOffset]::Now

& powershell -NoProfile -ExecutionPolicy Bypass -Command $Command *>&1 |
  Tee-Object -FilePath $logPath
$exitCode = $LASTEXITCODE
$endedAt = [DateTimeOffset]::Now

[ordered]@{
  name = $Name
  command = $Command
  startedAt = $startedAt.ToString('o')
  endedAt = $endedAt.ToString('o')
  durationSeconds = [Math]::Round(($endedAt - $startedAt).TotalSeconds, 3)
  exitCode = $exitCode
  log = (Resolve-Path -LiteralPath $logPath -Relative)
} | ConvertTo-Json | Set-Content -LiteralPath $metadataPath -Encoding utf8

exit $exitCode
