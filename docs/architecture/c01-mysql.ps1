# 本机隔离基线数据库；不安装服务；绝不可用于生产或真实数据。
$ErrorActionPreference = 'Stop'
$auditTools = 'H:\codex\林家餐厅小程序\.c01-tools'
$mysqlBase = Join-Path $auditTools 'mysql-8.4.10-winx64'
$mysqlData = Join-Path $auditTools 'mysql-data'
$logDir = Join-Path $PWD 'docs/audit-logs'
# 本机 MySQL 在中文 argv 路径启动失败；用已授权可视化目录的 ASCII junction。
$asciiAlias = 'C:\Users\Administrator\.codex\visualizations\2026\09\02\01a06276-a6a2-7ad2-9a39-3db93c49ca71\c01-runtime'
if (!(Test-Path -LiteralPath $asciiAlias)) { New-Item -ItemType Junction -Path $asciiAlias -Target $auditTools | Out-Null }
if (Test-Path -LiteralPath $mysqlData) { throw '隔离数据目录已存在，拒绝重新初始化。' }
New-Item -ItemType Directory -Path $mysqlData | Out-Null
& "$mysqlBase/bin/mysqld.exe" --no-defaults --initialize-insecure "--basedir=$mysqlBase" "--datadir=$mysqlData" --console 2>&1 | Tee-Object -FilePath "$logDir/45-mysql-initialize.log"
if ($LASTEXITCODE -ne 0) { throw "MySQL 初始化失败：$LASTEXITCODE" }
$mysqlBase = Join-Path $asciiAlias 'mysql-8.4.10-winx64'
$mysqlData = Join-Path $asciiAlias 'mysql-data'
$mysqlArgs = @('--no-defaults', "--basedir=$mysqlBase", "--datadir=$mysqlData", '--bind-address=127.0.0.1', '--port=33316', '--mysqlx=OFF', '--console')
$server = Start-Process -FilePath "$mysqlBase/bin/mysqld.exe" -ArgumentList $mysqlArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput "$logDir/46-mysql-server.stdout.log" -RedirectStandardError "$logDir/46-mysql-server.stderr.log"
@{ pid=$server.Id; executable="$mysqlBase/bin/mysqld.exe"; arguments=$mysqlArgs; started=(Get-Date -Format o); note='仅隔离审查实例，使用占位凭据；结束时停止' } | ConvertTo-Json | Set-Content "$logDir/46-mysql-server.json"
for ($i=0; $i -lt 20; $i++) {
  & "$mysqlBase/bin/mysqladmin.exe" --no-defaults --host=127.0.0.1 --port=33316 --user=root --connect-timeout=1 ping 2>$null
  if ($LASTEXITCODE -eq 0) { break }
  Start-Sleep -Seconds 1
}
$sql = "CREATE DATABASE c01_baseline_audit CHARACTER SET utf8mb4; CREATE USER 'c01_audit'@'127.0.0.1' IDENTIFIED BY 'local_placeholder'; GRANT ALL PRIVILEGES ON *.* TO 'c01_audit'@'127.0.0.1'; ALTER USER 'root'@'localhost' IDENTIFIED BY 'c01-local-root-placeholder'; SELECT VERSION();"
& "$mysqlBase/bin/mysql.exe" --no-defaults --host=127.0.0.1 --port=33316 --user=root --execute=$sql 2>&1 | Tee-Object -FilePath "$logDir/47-mysql-provision.log"
if ($LASTEXITCODE -ne 0) { throw "隔离数据库建库失败：$LASTEXITCODE" }
