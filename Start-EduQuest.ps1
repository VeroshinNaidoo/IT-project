param([switch]$DryRun)

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path -LiteralPath $PSScriptRoot).Path
if (-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) {
  Write-Error "EduQuest project folder does not exist: $ProjectRoot"
  exit 1
}
Set-Location -LiteralPath $ProjectRoot

if ($DryRun) {
  Write-Host "DRY RUN: project root = $ProjectRoot"
  Write-Host "Would run: npm run db:start"
  Write-Host "Would run: npm run db:migrate"
  Write-Host "Would run: npm run seed"
  Write-Host "Would start: powershell -NoProfile -ExecutionPolicy Bypass -File `"$ProjectRoot\scripts\run-backend.ps1`""
  Write-Host "Would start: powershell -NoProfile -ExecutionPolicy Bypass -File `"$ProjectRoot\scripts\run-ai-service.ps1`""
  Write-Host "Would start: powershell -NoProfile -ExecutionPolicy Bypass -File `"$ProjectRoot\scripts\run-frontend.ps1`""
  exit 0
}

function Stop-ProjectProcess($port) {
  $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($connection in $connections) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($connection.OwningProcess)" -ErrorAction SilentlyContinue
    if ($process -and $process.CommandLine -and $process.CommandLine.Replace('/', '\').ToLower().Contains($PSScriptRoot.ToLower())) {
      Write-Host "Stopping old EduQuest process on port $port"
      Stop-Process -Id $connection.OwningProcess -Force
    }
  }
}

function Wait-Health($url, $headers = @{}) {
  for ($attempt = 1; $attempt -le 60; $attempt++) {
    try {
      $response = Invoke-WebRequest -Uri $url -Headers $headers -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -eq 200) { return }
    } catch { Start-Sleep -Milliseconds 500 }
  }
  throw "Health check failed: $url"
}

if (-not (Test-Path 'node_modules')) { npm install }
npm run setup:token
foreach ($port in @(4000, 5173, 8000)) { Stop-ProjectProcess $port }

Write-Host 'Starting database...'
npm run db:start
npm run db:migrate
npm run seed

$tokenLine = Get-Content .env | Where-Object { $_ -match '^AI_SERVICE_TOKEN=' } | Select-Object -First 1
$token = $tokenLine.Substring('AI_SERVICE_TOKEN='.Length)
$env:AI_SERVICE_TOKEN = $token

Write-Host 'Starting backend...'
Write-Host "Command: powershell -NoProfile -ExecutionPolicy Bypass -File `"$ProjectRoot\scripts\run-backend.ps1`""
Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',"$ProjectRoot\scripts\run-backend.ps1" -WorkingDirectory $ProjectRoot
Write-Host 'Starting AI service...'
Write-Host "Command: powershell -NoProfile -ExecutionPolicy Bypass -File `"$ProjectRoot\scripts\run-ai-service.ps1`""
Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',"$ProjectRoot\scripts\run-ai-service.ps1" -WorkingDirectory $ProjectRoot
Write-Host 'Starting frontend...'
Write-Host "Command: powershell -NoProfile -ExecutionPolicy Bypass -File `"$ProjectRoot\scripts\run-frontend.ps1`""
Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',"$ProjectRoot\scripts\run-frontend.ps1" -WorkingDirectory $ProjectRoot

try {
  Wait-Health 'http://127.0.0.1:4000/health'
  Wait-Health 'http://127.0.0.1:8000/health' @{ 'x-ai-service-token' = $token }
  Wait-Health 'http://127.0.0.1:5173/health'
} catch {
  Write-Error "EduQuest startup failed: $($_.Exception.Message)"
  exit 1
}

Write-Host ''
Write-Host 'EduQuest is running:'
Write-Host '  Frontend: http://127.0.0.1:5173'
Write-Host '  Backend:  http://127.0.0.1:4000'
Write-Host '  AI:       http://127.0.0.1:8000'
Write-Host 'Keep this window open while using the app.'
Read-Host 'Press Enter to close'
