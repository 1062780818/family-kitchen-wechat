[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$EnvFile)

$ErrorActionPreference = 'Stop'
foreach ($line in Get-Content -LiteralPath $EnvFile) {
  if (-not $line -or $line.StartsWith('#')) { continue }
  $name, $value = $line.Split('=', 2)
  [Environment]::SetEnvironmentVariable($name, $value, 'Process')
}

Set-Location (Join-Path $PSScriptRoot '../../..' | Resolve-Path)
& node backend/dist/main.js
exit $LASTEXITCODE
