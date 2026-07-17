# Generate favicon PNGs: large Georgia "T" in #941E2F, shifted down for tab alignment.
param(
  [double]$FillRatio = 0.96,
  [double]$YShiftRatio = 0.09,
  [int]$Red = 148,
  [int]$Green = 30,
  [int]$Blue = 47
)

Add-Type -AssemblyName System.Drawing

function Get-FittedFontSize([System.Drawing.Graphics]$gfx, [int]$canvas, [double]$ratio) {
  $best = 10
  for ($fs = 10; $fs -le 160; $fs++) {
    $font = New-Object System.Drawing.Font("Georgia", $fs, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $size = $gfx.MeasureString("T", $font)
    $font.Dispose()
    if ($size.Width -gt ($canvas * $ratio) -or $size.Height -gt ($canvas * $ratio)) {
      break
    }
    $best = $fs
  }
  return $best
}

function New-TBitmap([int]$size, [int]$red, [int]$green, [int]$blue, [double]$ratio, [double]$yShiftRatio) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $gfx = [System.Drawing.Graphics]::FromImage($bmp)
  $gfx.Clear([System.Drawing.Color]::Transparent)
  $gfx.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
  $gfx.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

  $fontSize = Get-FittedFontSize $gfx $size $ratio
  $font = New-Object System.Drawing.Font("Georgia", $fontSize, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, $red, $green, $blue))
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = [System.Drawing.StringAlignment]::Center
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
  $yShift = [Math]::Round($size * $yShiftRatio)
  $rect = New-Object System.Drawing.RectangleF 0, $yShift, $size, ($size - $yShift)
  $gfx.DrawString("T", $font, $brush, $rect, $sf)

  Write-Host "  ${size}px -> font ${fontSize}px, y+${yShift}px"

  $font.Dispose()
  $brush.Dispose()
  $gfx.Dispose()
  return $bmp
}

$public = Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) "public"

foreach ($canvas in @(16, 32, 48, 180)) {
  $bmp = New-TBitmap $canvas $Red $Green $Blue $FillRatio $YShiftRatio
  $outName = if ($canvas -eq 180) { "apple-touch-icon.png" } elseif ($canvas -eq 48) { "favicon-48.png" } else { "favicon-$canvas.png" }
  $bmp.Save((Join-Path $public $outName), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

Write-Output "Wrote favicon PNGs (fill=$FillRatio, yShift=$YShiftRatio, color=#941E2F)"

node (Join-Path (Split-Path $PSScriptRoot -Parent) "scripts/verify-favicon.js")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
