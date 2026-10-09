# 逐个实测信源 feed 能不能用，产出一张"实测表"。
# 旧项目吃过"219 条源里只有 72 条有 feed"的亏，所以入库前先验一遍，别凭印象。
#
# 用法：
#   pwsh -File scripts/check-feeds.ps1 -List scripts/feed-candidates.txt -OutFile docs/规范/feed-实测.md
#
# 列表文件每行一条，制表符分隔：名称 <TAB> 分组 <TAB> 地址。
# 以 # 开头的行跳过。
param(
  [Parameter(Mandatory = $true)][string]$List,
  [string]$OutFile,
  [int]$TimeoutSec = 15,
  [int]$Throttle = 6,
  [string]$UserAgent = 'Mozilla/5.0 (compatible; DailyHotBot/0.1; +https://example.invalid/bot)'
)

$targets = Get-Content -LiteralPath $List -Encoding utf8 |
  Where-Object { $_ -match '\S' -and $_ -notmatch '^\s*#' } |
  ForEach-Object {
    $parts = $_ -split "`t"
    [pscustomobject]@{
      Name  = $parts[0].Trim()
      Group = $(if ($parts.Count -ge 3) { $parts[1].Trim() } else { '' })
      Url   = $parts[-1].Trim()
    }
  }

$rows = $targets | ForEach-Object -ThrottleLimit $Throttle -Parallel {
  $t = $_
  $tmp = [System.IO.Path]::GetTempFileName()
  try {
    $code = & curl.exe -sS -L --max-time $using:TimeoutSec -A $using:UserAgent `
      -o $tmp -w '%{http_code}' $t.Url 2>$null
    $code = "$code".Trim()
    $size = 0
    $head = ''
    if (Test-Path -LiteralPath $tmp) {
      $size = (Get-Item -LiteralPath $tmp).Length
      if ($size -gt 0) {
        $raw = Get-Content -LiteralPath $tmp -Raw -ErrorAction SilentlyContinue
        if ($raw) { $head = $raw.Substring(0, [Math]::Min(4000, $raw.Length)) }
      }
    }
    $kind = '不是 feed'
    if ($head -match '(?is)<rss|<feed|<rdf:RDF') { $kind = 'RSS/Atom' }
    elseif ($head -match '^\s*[\{\[]') { $kind = 'JSON' }
    $title = ''
    if ($head -match '(?is)<title[^>]*>(.*?)</title>') { $title = ($matches[1] -replace '\s+', ' ').Trim() }
    [pscustomobject]@{
      Name   = $t.Name
      Group  = $t.Group
      Url    = $t.Url
      Code   = $code
      Kind   = $kind
      Bytes  = $size
      FeedTitle = $title
    }
  }
  finally { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
}

$ok = $rows | Where-Object { $_.Code -eq '200' -and $_.Kind -ne '不是 feed' }
$bad = $rows | Where-Object { $_.Code -ne '200' -or $_.Kind -eq '不是 feed' }

$table = @()
$table += "| 源 | 分组 | HTTP | 类型 | 拿到的标题 | 地址 |"
$table += "| --- | --- | --- | --- | --- | --- |"
foreach ($r in ($rows | Sort-Object Group, Name)) {
  $mark = if ($r.Code -eq '200' -and $r.Kind -ne '不是 feed') { '✅' } else { '❌' }
  $table += "| $mark $($r.Name) | $($r.Group) | $($r.Code) | $($r.Kind) | $($r.FeedTitle) | $($r.Url) |"
}

$summary = @(
  "# 信源 feed 实测",
  '',
  "- 实测时间：$(Get-Date -Format 'yyyy-MM-dd HH:mm')（本机走 VPN，不代表服务器或 runner 的结果）",
  "- 总数：$($rows.Count)　可用：$($ok.Count)　不可用：$($bad.Count)",
  ''
) + $table

if ($OutFile) {
  Set-Content -LiteralPath $OutFile -Value ($summary -join "`n") -Encoding utf8NoBOM
  "已写入 $OutFile"
}

"总数 $($rows.Count)，可用 $($ok.Count)，不可用 $($bad.Count)"
$bad | Sort-Object Group, Name | ForEach-Object { "  ❌ $($_.Name) [$($_.Code)] $($_.Url)" }
