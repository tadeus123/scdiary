# Generate favicon PNGs with auto-fitted Georgia "T".
param(
  [double]$FillRatio = 0.9,
  [double]$YShiftRatio = 0.06,
  [int]$Red = 148,
  [int]$Green = 30,
  [int]$Blue = 47
)

Add-Type -AssemblyName System.Drawing

function Get-FittedFontSize([System.Drawing.Graphics]$gfx, [int]$canvas, [double]$ratio) {
  $best = 10
  for ($fs = 10; $fs -le 120; $fs++) {
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
  $gfx.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
  $gfx.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

  $fontSize = Get-FittedFontSize $gfx $size $ratio
  $font = New-Object System.Drawing.Font("Georgia", $fontSize, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb($red, $green, $blue))
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

$b32 = New-TBitmap 32 $Red $Green $Blue $FillRatio $YShiftRatio
$b16 = New-TBitmap 16 $Red $Green $Blue $FillRatio $YShiftRatio
$b48 = New-TBitmap 48 $Red $Green $Blue $FillRatio $YShiftRatio
$b180 = New-TBitmap 180 $Red $Green $Blue $FillRatio $YShiftRatio

$b32.Save((Join-Path $public "favicon-32.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$b16.Save((Join-Path $public "favicon-16.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$b48.Save((Join-Path $public "favicon-48.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$b180.Save((Join-Path $public "apple-touch-icon.png"), [System.Drawing.Imaging.ImageFormat]::Png)

$b32.Dispose()
$b16.Dispose()
$b48.Dispose()
$b180.Dispose()

Write-Output "Wrote favicon-16.png, favicon-32.png, favicon-48.png, apple-touch-icon.png (fill=$FillRatio, yShift=$YShiftRatio, color=rgb($Red,$Green,$Blue))"
