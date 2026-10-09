# 在本机启动或停止站点（api + worker + 网页）。
#
# 用法（在项目根目录下）：
#   pwsh -File scripts\本机启动.ps1            # 启动
#   pwsh -File scripts\本机启动.ps1 -Stop      # 停止，并清掉卡住的定时任务
#
# 两个注意：
#   1. 本机跑必须用**非 production** 模式（下面显式清掉 NODE_ENV），否则
#      ALLOW_PRIVATE_NETWORK_FETCH=true 会让进程拒绝启动。原因见 scripts/环境说明.md。
#   2. 别用任务管理器之类的硬杀 worker：pg-boss 的单例定时任务会卡住最长一小时。
#      用 -Stop 走这个脚本，它会顺手清掉僵尸任务。
param([switch]$Stop)

$ErrorActionPreference = 'Stop'
$engine = Join-Path $PSScriptRoot '..\engine' | Resolve-Path | Select-Object -ExpandProperty Path
$node = (Get-Command node).Source
$cache = Join-Path $engine '.cache'
New-Item -ItemType Directory -Force -Path $cache | Out-Null

function Get-SiteProcesses {
  Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'node.exe' -and (
      $_.CommandLine -like '*apps/api/src/main.ts*' -or
      $_.CommandLine -like '*apps/worker/src/main.ts*' -or
      ($_.CommandLine -like '*server.ts*' -and $_.CommandLine -notlike '*main.ts*'))
  }
}

if ($Stop) {
  $running = Get-SiteProcesses
  if (-not $running) { '没有在跑的站点进程。' } else {
    foreach ($p in $running) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue; "已停: $($p.ProcessId)" }
  }
  Start-Sleep -Seconds 3
  # worker 被硬杀后，pg-boss 的单例定时任务会卡在 active；顺手清掉，并把到点的信源重新排队。
  Push-Location $engine
  try {
    node --env-file=.env scripts/query.ts "UPDATE pgboss.job SET state='failed', completed_on=now() WHERE state='active' AND started_on < now() - interval '30 seconds'" | Out-Null
    node --env-file=.env scripts/query.ts "UPDATE sources SET next_fetch_at = now() WHERE enabled" | Out-Null
    '已清掉卡住的定时任务。'
  } finally { Pop-Location }
  return
}

if (Get-SiteProcesses) { '已经在跑了；要重启先 -Stop。'; return }

Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue
Start-Process -FilePath $node -ArgumentList '--env-file=.env','apps/api/src/main.ts' `
  -WorkingDirectory $engine -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $cache 'api.out.log') -RedirectStandardError (Join-Path $cache 'api.err.log')
Start-Process -FilePath $node -ArgumentList '--env-file=.env','apps/worker/src/main.ts' `
  -WorkingDirectory $engine -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $cache 'worker.out.log') -RedirectStandardError (Join-Path $cache 'worker.err.log')
Start-Process -FilePath $node -ArgumentList '--env-file=../../.env','server.ts' `
  -WorkingDirectory (Join-Path $engine 'apps\web') -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $cache 'web.out.log') -RedirectStandardError (Join-Path $cache 'web.err.log')

Start-Sleep -Seconds 12
'已启动：'
foreach ($p in Get-SiteProcesses) {
  $what = if ($p.CommandLine -like '*api/src*') { 'api' } elseif ($p.CommandLine -like '*worker/src*') { 'worker' } else { 'web' }
  "  $what  PID $($p.ProcessId)"
}
"站点：http://localhost:3000　日志：$cache"
