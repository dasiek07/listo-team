# Generates icon.png (favicon) and listo.ico (app icon) next to this script.
Add-Type -AssemblyName System.Drawing
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path

function New-ListoPng([int]$size) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::Transparent)
  $r = [single]($size * 0.22); $pad = [single]($size * 0.04); $w = [single]($size - 2 * $pad)
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddArc($pad, $pad, 2*$r, 2*$r, 180, 90)
  $path.AddArc($pad + $w - 2*$r, $pad, 2*$r, 2*$r, 270, 90)
  $path.AddArc($pad + $w - 2*$r, $pad + $w - 2*$r, 2*$r, 2*$r, 0, 90)
  $path.AddArc($pad, $pad + $w - 2*$r, 2*$r, 2*$r, 90, 90)
  $path.CloseFigure()
  $g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(220, 76, 62))), $path)
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), ([single]($size * 0.11))
  $pen.StartCap = 'Round'; $pen.EndCap = 'Round'; $pen.LineJoin = 'Round'
  $pts = [System.Drawing.PointF[]]@(
    (New-Object System.Drawing.PointF ($size * 0.28), ($size * 0.52)),
    (New-Object System.Drawing.PointF ($size * 0.44), ($size * 0.68)),
    (New-Object System.Drawing.PointF ($size * 0.73), ($size * 0.36)))
  $g.DrawLines($pen, $pts)
  $g.Dispose()
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
  return ,$ms.ToArray()
}

[IO.File]::WriteAllBytes((Join-Path $dir 'icon.png'), (New-ListoPng 256))
[IO.File]::WriteAllBytes((Join-Path $dir 'icon-192.png'), (New-ListoPng 192))
[IO.File]::WriteAllBytes((Join-Path $dir 'icon-512.png'), (New-ListoPng 512))

# „maskable” (telefon przycina ikonę w kółko/kształt) – pełne tło, znak w bezpiecznej strefie
$m = New-Object System.Drawing.Bitmap 512, 512
$g = [System.Drawing.Graphics]::FromImage($m); $g.SmoothingMode = 'AntiAlias'
$g.Clear([System.Drawing.Color]::FromArgb(220, 76, 62))
$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), ([single]44)
$pen.StartCap = 'Round'; $pen.EndCap = 'Round'; $pen.LineJoin = 'Round'
$g.DrawLines($pen, [System.Drawing.PointF[]]@((New-Object System.Drawing.PointF 170, 268), (New-Object System.Drawing.PointF 230, 328), (New-Object System.Drawing.PointF 346, 200)))
$g.Dispose(); $m.Save((Join-Path $dir 'icon-maskable.png'), [System.Drawing.Imaging.ImageFormat]::Png); $m.Dispose()

# ICO with embedded PNG images (supported since Windows Vista)
$sizes = 16, 24, 32, 48, 64, 128, 256
$imgs = $sizes | ForEach-Object { ,(New-ListoPng $_) }
$out = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter $out
$bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $s = $sizes[$i]; $len = $imgs[$i].Length
  $bw.Write([byte]($s % 256)); $bw.Write([byte]($s % 256)); $bw.Write([byte]0); $bw.Write([byte]0)
  $bw.Write([uint16]1); $bw.Write([uint16]32); $bw.Write([uint32]$len); $bw.Write([uint32]$offset)
  $offset += $len
}
foreach ($img in $imgs) { $bw.Write($img) }
$bw.Flush()
[IO.File]::WriteAllBytes((Join-Path $dir 'listo.ico'), $out.ToArray())
"Icons written to $dir"
