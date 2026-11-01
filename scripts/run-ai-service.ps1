param()
$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
if (-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) { Write-Error "Project folder does not exist: $ProjectRoot"; exit 1 }
Set-Location -LiteralPath $ProjectRoot
Write-Host "Working directory: $ProjectRoot"
if (where.exe py 2>$null) { Write-Host 'Command: py -3 ai-service/run.py'; & py -3 ai-service/run.py }
elseif (where.exe python 2>$null) { Write-Host 'Command: python ai-service/run.py'; & python ai-service/run.py }
else { Write-Error 'Python not found. Install it from https://www.python.org/downloads/windows/'; exit 1 }
exit $LASTEXITCODE
