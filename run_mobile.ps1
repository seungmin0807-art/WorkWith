param(
  [int]$Port = 8000
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$python = Join-Path $root ".venv\\Scripts\\python.exe"
if (-not (Test-Path $python)) {
  $python = "python"
}

Write-Host "Building precomputed demo assets..."
& $python "scripts\\build_demo_assets.py" --correct "correct.mp4" --wrong "wrong.mp4" --output-dir "app"
if ($LASTEXITCODE -ne 0) {
  throw "Asset build failed."
}

Write-Host "Starting local preview on http://127.0.0.1:$Port/"
& $python "scripts\\serve.py" --host "0.0.0.0" --port $Port --root "app"
