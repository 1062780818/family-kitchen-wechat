[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$EnvFile,
  [Parameter(Mandatory = $true)][string]$PnpmCli,
  [Parameter(Mandatory = $true)][string]$MysqlCli,
  [Parameter(Mandatory = $true)][string]$Backup
)

$ErrorActionPreference = 'Continue'
$repo = (Join-Path $PSScriptRoot '../../..' | Resolve-Path).Path
$env:C01_PNPM_CLI = $PnpmCli
$env:Path = "$repo\docs\architecture\bin;$env:Path"

& pnpm --filter '@family-kitchen/backend' run storage:refs:apply "--env-file=$EnvFile" "--backup=$Backup" *> $null
$applyExit = $LASTEXITCODE
$changeId = (Get-Content -Raw -LiteralPath $Backup | ConvertFrom-Json).changes[0].id
& $MysqlCli '--host=127.0.0.1' '--port=33816' '--user=fk005' '--database=fk_c03_005b' "--execute=UPDATE recipe SET image_urls=JSON_ARRAY('family/tampered') WHERE id='$changeId';" *> $null
& pnpm --filter '@family-kitchen/backend' run storage:refs:rollback "--env-file=$EnvFile" "--backup=$Backup" *> $null
$rollbackExit = $LASTEXITCODE
$tampered = [int]((& $MysqlCli '--host=127.0.0.1' '--port=33816' '--user=fk005' '--database=fk_c03_005b' '--batch' '--skip-column-names' "--execute=SELECT COUNT(*) FROM recipe WHERE id='$changeId' AND CAST(image_urls AS CHAR) LIKE '%family/tampered%';" | Select-Object -Last 1))

$result = [pscustomobject]@{
  applyExitCode = $applyExit
  rollbackExitCode = $rollbackExit
  rollbackConflictPreservedCurrentValue = $tampered -eq 1
}
$result | ConvertTo-Json
if ($applyExit -ne 0 -or $rollbackExit -eq 0 -or $tampered -ne 1) { exit 1 }
exit 0
