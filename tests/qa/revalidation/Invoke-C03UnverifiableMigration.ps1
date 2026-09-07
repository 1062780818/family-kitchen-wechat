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
$id = 'c03-unverifiable-005'
$url = 'https://example.invalid/family/unknown.png?X-Amz-Signature=fake'

& $MysqlCli '--host=127.0.0.1' '--port=33816' '--user=fk005' '--database=fk_c03_005b' "--execute=DELETE FROM recipe WHERE id='$id'; INSERT INTO recipe (id,family_id,name,image_urls,meal_tags,flavor_tags,created_by_user_id,updated_at) SELECT '$id',family_id,'C03 unverifiable',JSON_ARRAY('$url'),JSON_ARRAY(),JSON_ARRAY(),created_by_user_id,NOW(3) FROM recipe LIMIT 1;" *> $null
$before = [int]((& $MysqlCli '--host=127.0.0.1' '--port=33816' '--user=fk005' '--database=fk_c03_005b' '--batch' '--skip-column-names' "--execute=SELECT COUNT(*) FROM recipe WHERE id='$id' AND CAST(image_urls AS CHAR) LIKE '%example.invalid%';" | Select-Object -Last 1))
& pnpm --filter '@family-kitchen/backend' run storage:refs:preview "--env-file=$EnvFile" *> $null
$previewExit = $LASTEXITCODE
$after = [int]((& $MysqlCli '--host=127.0.0.1' '--port=33816' '--user=fk005' '--database=fk_c03_005b' '--batch' '--skip-column-names' "--execute=SELECT COUNT(*) FROM recipe WHERE id='$id' AND CAST(image_urls AS CHAR) LIKE '%example.invalid%';" | Select-Object -Last 1))

[pscustomobject]@{
  previewExitCode = $previewExit
  fixturePresentBefore = $before -eq 1
  unverifiableRecordUnchangedAfter = $after -eq 1
} | ConvertTo-Json
if ($previewExit -ne 0 -or $before -ne 1 -or $after -ne 1) { exit 1 }
exit 0
