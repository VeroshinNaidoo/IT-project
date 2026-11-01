$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Test-Path 'node_modules')) {
  Write-Host 'Installing Node dependencies...'
  npm install
}

Write-Host 'Starting local database...'
npm run db:start

Write-Host 'Applying database migrations...'
npm run db:migrate

Write-Host 'Loading demo data...'
npm run seed

Write-Host ''
Write-Host 'EduQuest is starting at http://127.0.0.1:5173'
Write-Host 'Keep this window open while using the app.'
Write-Host ''
npm run dev
