# 生成 TECH HOT 的站点图标：site/brand/ 下的 icon.png(512)、icon-192.png、apple-icon.png(180)、favicon.ico。
# 图形和 logo.svg 一致：深色圆角底 + 三根递升的青色柱子（"热度在涨"）。
# 用法：powershell -ExecutionPolicy Bypass -File scripts\生成站点图标.ps1（在项目根目录下跑）
param([string]$OutDir)

$ErrorActionPreference = 'Stop'
if (-not $OutDir) { $OutDir = Join-Path $PSScriptRoot '..\engine\site\brand' }
$OutDir = (Resolve-Path -LiteralPath $OutDir).Path
Add-Type -AssemblyName System.Drawing

$bg = [System.Drawing.ColorTranslator]::FromHtml('#13191c')
$accent = [System.Drawing.ColorTranslator]::FromHtml('#2ce2e8')
$bars = @(
  @(112.0, 272.0, 72.0, 128.0, 0.55),
  @(220.0, 192.0, 72.0, 208.0, 0.8),
  @(328.0, 112.0, 72.0, 288.0, 1.0)
)

function New-RoundedPath([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function New-Mark([int]$size) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)
  $k = $size / 512.0
  $bgPath = New-RoundedPath 0 0 512 512 116
  $bgBrush = New-Object System.Drawing.SolidBrush($bg)
  $g.ScaleTransform($k, $k)
  $g.FillPath($bgBrush, $bgPath)
  foreach ($b in $bars) {
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb([int](255 * $b[4]), $accent))
    $barPath = New-RoundedPath $b[0] $b[1] $b[2] $b[3] 18
    $g.FillPath($brush, $barPath)
    $barPath.Dispose(); $brush.Dispose()
  }
  $bgPath.Dispose(); $bgBrush.Dispose(); $g.Dispose()
  return $bmp
}

function Save-Png([int]$size, [string]$name) {
  $bmp = New-Mark $size
  $file = Join-Path $OutDir $name
  $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  "写出 $name（${size}×${size}）"
}

Save-Png 512 'icon.png'
Save-Png 192 'icon-192.png'
Save-Png 180 'apple-icon.png'

# favicon.ico：把几个尺寸的 PNG 直接装进 ICO 容器（Vista 以后的系统都支持 PNG 条目）。
$sizes = @(16, 32, 48, 64)
$payloads = @()
foreach ($s in $sizes) {
  $bmp = New-Mark $s
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $payloads += , $ms.ToArray()
  $ms.Dispose(); $bmp.Dispose()
}
$out = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($out)
$bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $s = $sizes[$i]
  $bw.Write([byte]($(if ($s -ge 256) { 0 } else { $s })))
  $bw.Write([byte]($(if ($s -ge 256) { 0 } else { $s })))
  $bw.Write([byte]0); $bw.Write([byte]0)
  $bw.Write([uint16]1); $bw.Write([uint16]32)
  $bw.Write([uint32]$payloads[$i].Length)
  $bw.Write([uint32]$offset)
  $offset += $payloads[$i].Length
}
foreach ($p in $payloads) { $bw.Write($p) }
$bw.Flush()
[System.IO.File]::WriteAllBytes((Join-Path $OutDir 'favicon.ico'), $out.ToArray())
$bw.Dispose(); $out.Dispose()
"写出 favicon.ico（$($sizes -join '/')）"
