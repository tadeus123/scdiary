# Copy locked tab icons into public/. Master artwork is favicon-locked/source.png (1024x1024).
# Do not overwrite source.png. If a test looks wrong: npm run restore:favicon

$locked = Join-Path $PSScriptRoot "favicon-locked"
$public = Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) "public"

$files = @(
  "favicon-16.png",
  "favicon-32.png",
  "favicon-48.png",
  "apple-touch-icon.png"
)

if (-not (Test-Path (Join-Path $locked "source.png"))) {
  Write-Error "Missing high-quality master: $locked\source.png"
  exit 1
}

foreach ($file in $files) {
  $from = Join-Path $locked $file
  if (-not (Test-Path $from)) {
    Write-Error "Missing locked copy: $from"
    exit 1
  }
  Copy-Item $from (Join-Path $public $file) -Force
  Write-Host "wrote $file from locked copy"
}

Write-Output "Wrote favicon PNGs from locked cream-background T (master: source.png 1024x1024)"

node (Join-Path $PSScriptRoot "verify-favicon.js")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
