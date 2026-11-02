param([switch]$DryRun)

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path -LiteralPath $PSScriptRoot).Path
$LogPath = Join-Path $ProjectRoot 'docs\eduquest-launch.log'

function Say($message) { Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $message" }
function Step($name, [scriptblock]$action) {
  Say "STEP: $name"
  try { & $action; if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "Exit code $LASTEXITCODE" } }
  catch { throw "${name}: $($_.Exception.Message)" }
}

try {
  if (-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) {
    throw "EduQuest project folder does not exist: $ProjectRoot"
  }
  Step 'Set working directory' { Set-Location -LiteralPath $ProjectRoot; Say "Working directory: $((Get-Location).Path)" }

  if ($DryRun) {
    Say "DRY RUN: project root = $ProjectRoot"
    Say 'Would run: npm run db:start'
    Say 'Would run: npm run db:migrate'
    Say 'Would run: npm run seed'
    Say 'Would start: study session reminders worker'
    Say "Would start: powershell -NoProfile -ExecutionPolicy Bypass -File `"$ProjectRoot\scripts\run-backend.ps1`""
    Say "Would start: powershell -NoProfile -ExecutionPolicy Bypass -File `"$ProjectRoot\scripts\run-ai-service.ps1`""
    Say "Would start: powershell -NoProfile -ExecutionPolicy Bypass -File `"$ProjectRoot\scripts\run-worker.ps1`""
    Say "Would start: powershell -NoProfile -ExecutionPolicy Bypass -File `"$ProjectRoot\scripts\run-frontend.ps1`""
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

  Step 'Install dependencies if needed' { if (-not (Test-Path 'node_modules')) { npm install } }
  Step 'Set up service token' { npm run setup:token }
  Step 'Stop old project processes' { foreach ($port in @(4000, 5173, 8000)) { Stop-ProjectProcess $port } }

  Step 'Start database' { npm run db:start }
  Step 'Run migrations' { npm run db:migrate }
  Step 'Seed demo data' { npm run seed }
  Step 'Start session reminders' { Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$ProjectRoot\scripts\run-session-reminders.ps1`"" -WorkingDirectory $ProjectRoot }

  $tokenLine = Get-Content .env | Where-Object { $_ -match '^AI_SERVICE_TOKEN=' } | Select-Object -First 1
  if (-not $tokenLine) { throw 'AI_SERVICE_TOKEN is missing: run npm run setup:token' }
  $token = $tokenLine.Substring('AI_SERVICE_TOKEN='.Length).Trim().Trim('"')
  if ([string]::IsNullOrWhiteSpace($token)) { throw 'AI_SERVICE_TOKEN is empty: run npm run setup:token' }
  $env:AI_SERVICE_TOKEN = $token

  Step 'Start backend' { Say "Command: powershell -NoProfile -ExecutionPolicy Bypass -File `"$ProjectRoot\scripts\run-backend.ps1`""; Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',"$ProjectRoot\scripts\run-backend.ps1" -WorkingDirectory $ProjectRoot }
  Step 'Start AI service' { Say "Command: powershell -NoProfile -ExecutionPolicy Bypass -File `"$ProjectRoot\scripts\run-ai-service.ps1`""; Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',"$ProjectRoot\scripts\run-ai-service.ps1" -WorkingDirectory $ProjectRoot }
  Step 'Start AI worker' { Say "Command: powershell -NoProfile -ExecutionPolicy Bypass -File `"$ProjectRoot\scripts\run-worker.ps1`""; Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',"$ProjectRoot\scripts\run-worker.ps1" -WorkingDirectory $ProjectRoot }
  Step 'Start frontend' { Say "Command: powershell -NoProfile -ExecutionPolicy Bypass -File `"$ProjectRoot\scripts\run-frontend.ps1`""; Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',"$ProjectRoot\scripts\run-frontend.ps1" -WorkingDirectory $ProjectRoot }

  Step 'Check backend health' { Wait-Health 'http://127.0.0.1:4000/health' }
  Step 'Check AI service health' { Wait-Health 'http://127.0.0.1:8000/health' @{ 'x-ai-service-token' = $token } }
  Step 'Check frontend health' { Wait-Health 'http://127.0.0.1:5173/health' }

  Say 'EduQuest is running:'
  Say 'Frontend: http://127.0.0.1:5173'
  Say 'Backend:  http://127.0.0.1:4000'
  Say 'AI:       http://127.0.0.1:8000'
} catch {
  Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Working directory: $((Get-Location).Path)"
  Write-Host 'Fix the reported step, then double-click Run EduQuest.bat again.'
  exit 1
} finally {
  Read-Host 'Press Enter to close'
}
