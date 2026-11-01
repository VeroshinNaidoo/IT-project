param()
$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
if (-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) { Write-Error "Project folder does not exist: $ProjectRoot"; exit 1 }
Set-Location -LiteralPath $ProjectRoot
Write-Host "Working directory: $ProjectRoot"
Write-Host 'Command: npx vite --config frontend/vite.config.js'
& npx vite --config frontend/vite.config.js
exit $LASTEXITCODE
