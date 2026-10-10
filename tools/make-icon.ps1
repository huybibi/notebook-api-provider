# Tạo build/icon.ico (nhiều kích thước) + build/icon.png cho app và shortcut.
# Chạy: pwsh -File tools\make-icon.ps1
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root 'build'
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

$SIZES = @(16, 24, 32, 48, 64, 128, 256)

function Get-RoundRect([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function New-IconBitmap([int]$size) {
  $s = [single]$size
  $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)

  # nền: vuông bo góc, chuyển sắc tím -> xanh
  $bgPath = Get-RoundRect 0.5 0.5 ($s - 1) ($s - 1) ([single]($s * 0.22))
  $bgRect = New-Object System.Drawing.RectangleF 0, 0, $s, $s
  $c1 = [System.Drawing.Color]::FromArgb(255, 124, 92, 255)
  $c2 = [System.Drawing.Color]::FromArgb(255, 34, 211, 238)
  $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($bgRect, $c1, $c2, [single]45)
  $g.FillPath($bgBrush, $bgPath)

  # trang giấy
  $px = [single]($s * 0.235)
  $py = [single]($s * 0.165)
  $pw = [single]($s * 0.53)
  $ph = [single]($s * 0.67)
  $pagePath = Get-RoundRect $px $py $pw $ph ([single]($s * 0.07))
  $pageBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(250, 250, 252, 255))
  $g.FillPath($pageBrush, $pagePath)

  # gáy sổ
  $spinePath = Get-RoundRect $px $py ([single]($s * 0.085)) $ph ([single]($s * 0.04))
  $spineBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 168, 148, 255))
  $g.FillPath($spineBrush, $spinePath)

  # ba dòng chữ
  $lineBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 132, 120, 220))
  $tx = [single]($s * 0.375)
  $widths = @(0.30, 0.265, 0.19)
  $ys = @(0.325, 0.455, 0.585)
  for ($i = 0; $i -lt 3; $i++) {
    $lw = [single]($s * $widths[$i])
    $lh = [single]($s * 0.058)
    $lp = Get-RoundRect $tx ([single]($s * $ys[$i])) $lw $lh ([single]($s * 0.03))
    $g.FillPath($lineBrush, $lp)
    $lp.Dispose()
  }

  # thẻ đánh dấu
  $bm = New-Object System.Drawing.Drawing2D.GraphicsPath
  $bx = [single]($s * 0.60)
  $by = [single]($s * 0.165)
  $bw = [single]($s * 0.105)
  $bh = [single]($s * 0.215)
  $bm.AddPolygon(@(
      (New-Object System.Drawing.PointF $bx, $by),
      (New-Object System.Drawing.PointF ($bx + $bw), $by),
      (New-Object System.Drawing.PointF ($bx + $bw), ($by + $bh)),
      (New-Object System.Drawing.PointF ($bx + $bw / 2), ($by + $bh * 0.74)),
      (New-Object System.Drawing.PointF $bx, ($by + $bh))
    ))
  $bmBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 34, 211, 238))
  $g.FillPath($bmBrush, $bm)

  foreach ($o in @($bgBrush, $pageBrush, $spineBrush, $lineBrush, $bmBrush, $bgPath, $pagePath, $spinePath, $bm)) {
    $o.Dispose()
  }
  $g.Dispose()
  return $bmp
}

$pngs = @()
foreach ($sz in $SIZES) {
  $bmp = New-IconBitmap $sz
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $pngs += , $ms.ToArray()
  if ($sz -eq 256) { $bmp.Save((Join-Path $outDir 'icon.png'), [System.Drawing.Imaging.ImageFormat]::Png) }
  $bmp.Dispose()
  $ms.Dispose()
}

# PNG 512 cho electron-builder / dùng chung
$big = New-IconBitmap 512
$big.Save((Join-Path $outDir 'icon-512.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$big.Dispose()

$icoPath = Join-Path $outDir 'icon.ico'
$fs = [System.IO.File]::Create($icoPath)
$bw = New-Object System.IO.BinaryWriter($fs)
$bw.Write([UInt16]0)
$bw.Write([UInt16]1)
$bw.Write([UInt16]$pngs.Count)
$offset = 6 + 16 * $pngs.Count
for ($i = 0; $i -lt $pngs.Count; $i++) {
  $dim = if ($SIZES[$i] -ge 256) { 0 } else { $SIZES[$i] }
  $bw.Write([Byte]$dim)
  $bw.Write([Byte]$dim)
  $bw.Write([Byte]0)
  $bw.Write([Byte]0)
  $bw.Write([UInt16]1)
  $bw.Write([UInt16]32)
  $bw.Write([UInt32]$pngs[$i].Length)
  $bw.Write([UInt32]$offset)
  $offset += $pngs[$i].Length
}
foreach ($p in $pngs) { $bw.Write($p) }
$bw.Flush()
$bw.Close()
$fs.Close()

Get-Item $icoPath, (Join-Path $outDir 'icon.png'), (Join-Path $outDir 'icon-512.png') |
  Select-Object Name, Length | Format-Table -AutoSize
