[CmdletBinding()]
param(
  [string]$PnpmCommand
)

$ErrorActionPreference = 'Stop'
if ($PnpmCommand) {
  $pnpmExecutable = $PnpmCommand
  $pnpmPrefix = @()
} elseif ($env:npm_execpath -and (Test-Path -LiteralPath $env:npm_execpath)) {
  $pnpmExecutable = (Get-Command node -ErrorAction Stop).Source
  $pnpmPrefix = @($env:npm_execpath)
} else {
  $pnpmExecutable = (Get-Command pnpm -ErrorAction Stop).Source
  $pnpmPrefix = @()
}

function Invoke-PinnedPnpm {
  param([string[]]$Arguments)
  & $pnpmExecutable @pnpmPrefix @Arguments
}

$version = (Invoke-PinnedPnpm @('--version')).Trim()
if ($version -ne '9.12.0') {
  throw "pnpm 9.12.0 is required; found $version"
}

# Serialize lifecycle hooks. pnpm 9.12 can otherwise fail under the Windows
# non-interactive runner with `readStream must be readable` while multiple
# install hooks write concurrently.
Invoke-PinnedPnpm @('install', '--frozen-lockfile', '--child-concurrency=1', '--reporter=append-only')
if ($LASTEXITCODE -ne 0) { throw 'frozen dependency install failed' }

# verify:retained performs Prisma generation before any backend typecheck/build.
Invoke-PinnedPnpm @('run', 'verify:retained')
if ($LASTEXITCODE -ne 0) { throw 'retained verification failed' }
