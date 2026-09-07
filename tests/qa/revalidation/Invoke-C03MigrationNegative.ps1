[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$EnvFile,
  [Parameter(Mandatory = $true)][string]$PnpmCli,
  [Parameter(Mandatory = $true)][string]$MysqlCli
)

$ErrorActionPreference = 'Continue'
$repo = (Join-Path $PSScriptRoot '../../..' | Resolve-Path).Path
$env:C01_PNPM_CLI = $PnpmCli
$env:Path = "$repo\docs\architecture\bin;$env:Path"

function Get-LegacyCount {
  $value = & $MysqlCli '--host=127.0.0.1' '--port=33816' '--user=fk005' '--database=fk_c03_005b' '--batch' '--skip-column-names' '--execute=SELECT COUNT(*) FROM recipe WHERE CAST(image_urls AS CHAR) LIKE ''%X-Amz-Signature%'';'
  return [int]($value | Select-Object -Last 1)
}

$before = Get-LegacyCount
$cases = @(
  @{ name = 'literal-double-dash'; arguments = @('--filter', '@family-kitchen/backend', 'run', 'storage:refs:apply', '--', "--env-file=$EnvFile", '--backup=H:\c03-005-runtime\backups\bad-literal.json') },
  @{ name = 'relative'; arguments = @('--filter', '@family-kitchen/backend', 'run', 'storage:refs:apply', "--env-file=$EnvFile", '--backup=relative.json') },
  @{ name = 'missing-backup'; arguments = @('--filter', '@family-kitchen/backend', 'run', 'storage:refs:apply', "--env-file=$EnvFile") },
  @{ name = 'unknown'; arguments = @('--filter', '@family-kitchen/backend', 'run', 'storage:refs:apply', "--env-file=$EnvFile", '--backup=H:\c03-005-runtime\backups\bad-unknown.json', '--bogus=x') },
  @{ name = 'invalid-parent'; arguments = @('--filter', '@family-kitchen/backend', 'run', 'storage:refs:apply', "--env-file=$EnvFile", '--backup=H:\c03-005-runtime\missing-parent\bad.json') },
  @{ name = 'existing-backup'; arguments = @('--filter', '@family-kitchen/backend', 'run', 'storage:refs:apply', "--env-file=$EnvFile", '--backup=H:\c03-005-runtime\backups\apply-3.json') }
)

$results = foreach ($case in $cases) {
  & pnpm @($case.arguments) *> $null
  $code = $LASTEXITCODE
  $after = Get-LegacyCount
  [pscustomobject]@{
    name = $case.name
    exitCode = $code
    before = $before
    after = $after
    unchanged = $after -eq $before
  }
}

$results | ConvertTo-Json
$failed = $results | Where-Object { $_.exitCode -eq 0 -or -not $_.unchanged }
if ($failed) { exit 1 }
exit 0
