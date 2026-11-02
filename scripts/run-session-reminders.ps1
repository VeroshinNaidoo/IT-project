$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $ProjectRoot
node backend/scripts/session-reminders.js
if ($LASTEXITCODE -ne 0) { throw 'Study session reminder worker failed.' }
