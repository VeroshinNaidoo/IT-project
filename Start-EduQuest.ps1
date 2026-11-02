param([switch]$DryRun)

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path -LiteralPath $PSScriptRoot).Path
$LogPath = Join-Path $ProjectRoot 'docs\eduquest-launch.log'
$RuntimeLogDirectory = Join-Path $ProjectRoot 'docs\runtime-logs'

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

function Stop-ProcessTree([int]$processId) {
  $processes = Get-CimInstance Win32_Process
  $children = @($processes | Where-Object { $_.ParentProcessId -eq $processId })
  foreach ($child in $children) { Stop-ProcessTree $child.ProcessId }
  Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
}

function Stop-PreviousProjectLaunchers {
  $normalRoot = $ProjectRoot.Replace('/', '\').ToLowerInvariant()
  $knownScripts = @('run-backend.ps1', 'run-ai-service.ps1', 'run-worker.ps1', 'run-frontend.ps1', 'run-session-reminders.ps1')
  $launchers = Get-CimInstance Win32_Process | Where-Object {
    $command = if ($_.CommandLine) { $_.CommandLine.Replace('/', '\').ToLowerInvariant() } else { '' }
    $_.Name -eq 'powershell.exe' -and $command.Contains($normalRoot) -and ($knownScripts | Where-Object { $command.Contains($_) })
  }
  foreach ($launcher in $launchers) {
    Say "Stopping previous EduQuest $($launcher.ProcessId)"
    Stop-ProcessTree $launcher.ProcessId
  }
}

function Wait-Health($url, $headers = @{}, $process = $null, $serviceName = 'Service') {
  $consecutiveSuccesses = 0
  for ($attempt = 1; $attempt -le 60; $attempt++) {
    if ($process -and $process.HasExited) {
      throw "$serviceName exited before becoming healthy (exit code $($process.ExitCode)). Check docs\runtime-logs."
    }
    try {
      $response = Invoke-WebRequest -Uri $url -Headers $headers -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -eq 200) {
        $consecutiveSuccesses++
        if ($consecutiveSuccesses -ge 3) { return }
      } else { $consecutiveSuccesses = 0 }
    } catch { $consecutiveSuccesses = 0 }
    Start-Sleep -Milliseconds 500
  }
  throw "Health check failed: $url"
}

function Read-EnvValue([string]$name) {
  $line = Get-Content .env | Where-Object { $_ -match "^\s*$([regex]::Escape($name))\s*=" } | Select-Object -First 1
  if (-not $line) { return '' }
  return ($line.Substring($line.IndexOf('=') + 1).Trim().Trim('"').Trim("'"))
}

function Ensure-LocalAiProvider {
  $provider = Read-EnvValue 'AI_PROVIDER'
  $baseUrl = Read-EnvValue 'AI_BASE_URL'
  $model = Read-EnvValue 'AI_MODEL'
  if ($provider -ne 'openai_compatible' -or [string]::IsNullOrWhiteSpace($baseUrl)) { return }
  try { $uri = [Uri]$baseUrl } catch { throw 'AI_BASE_URL is malformed in .env.' }
  if ($uri.Host -notin @('127.0.0.1', 'localhost') -or $uri.Port -ne 11434) { return }
  if ([string]::IsNullOrWhiteSpace($model)) { throw 'AI_MODEL is empty in .env.' }

  $tagsUrl = 'http://127.0.0.1:11434/api/tags'
  try { $tags = Invoke-RestMethod -Uri $tagsUrl -TimeoutSec 2 }
  catch {
    $ollama = Get-Command ollama -ErrorAction SilentlyContinue
    if (-not $ollama) { throw 'Ollama is not installed. Install it, then run Check EduQuest AI.bat.' }
    Say 'Starting local Ollama service'
    $ollamaProcess = Start-Process -FilePath $ollama.Source -ArgumentList @('serve') -WindowStyle Hidden -PassThru
    for ($attempt = 1; $attempt -le 30; $attempt++) {
      if ($ollamaProcess.HasExited) { throw 'Ollama stopped while starting. Open Ollama and run the launcher again.' }
      try { $tags = Invoke-RestMethod -Uri $tagsUrl -TimeoutSec 2; break }
      catch { Start-Sleep -Seconds 1 }
    }
  }
  if (-not $tags) { throw 'Ollama did not become ready. Open Ollama and run Check EduQuest AI.bat.' }
  $installed = @($tags.models | ForEach-Object { $_.name })
  if ($installed -notcontains $model) {
    throw "Ollama model $model is not installed. Run Check EduQuest AI.bat."
  }
  Say "Local AI model ready: $model"
}

function Start-ProjectScript([string]$name, [string]$relativePath, [switch]$Hidden) {
  $scriptPath = Join-Path $ProjectRoot $relativePath
  if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) {
    throw "$name script does not exist: $scriptPath"
  }
  $quotedScriptPath = '"' + $scriptPath + '"'
  New-Item -ItemType Directory -Path $RuntimeLogDirectory -Force | Out-Null
  $logStem = [IO.Path]::GetFileNameWithoutExtension($relativePath)
  $standardOutput = Join-Path $RuntimeLogDirectory "$logStem.out.log"
  $standardError = Join-Path $RuntimeLogDirectory "$logStem.err.log"
  Say "Command: powershell.exe -NoProfile -ExecutionPolicy Bypass -File $quotedScriptPath"
  $startArguments = @{
    FilePath = 'powershell.exe'
    ArgumentList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $quotedScriptPath)
    WorkingDirectory = $ProjectRoot
    RedirectStandardOutput = $standardOutput
    RedirectStandardError = $standardError
  }
  if ($Hidden) { $startArguments.WindowStyle = 'Hidden' }
  return Start-Process @startArguments -PassThru
}

  Step 'Install dependencies if needed' { if (-not (Test-Path 'node_modules')) { npm install } }
  Step 'Set up service token' { npm run setup:token }
  Step 'Stop old project processes' {
    Stop-PreviousProjectLaunchers
    foreach ($port in @(4000, 5173, 8000)) { Stop-ProjectProcess $port }
  }

  Step 'Check local AI provider' { Ensure-LocalAiProvider }

  Step 'Start database' { npm run db:start }
  Step 'Run migrations' { npm run db:migrate }
  Step 'Seed demo data' { npm run seed }
  $reminderProcess = Step 'Start session reminders' { Start-ProjectScript 'Session reminders' 'scripts\run-session-reminders.ps1' -Hidden }

  $tokenLine = Get-Content .env | Where-Object { $_ -match '^AI_SERVICE_TOKEN=' } | Select-Object -First 1
  if (-not $tokenLine) { throw 'AI_SERVICE_TOKEN is missing: run npm run setup:token' }
  $token = $tokenLine.Substring('AI_SERVICE_TOKEN='.Length).Trim().Trim('"')
  if ([string]::IsNullOrWhiteSpace($token)) { throw 'AI_SERVICE_TOKEN is empty: run npm run setup:token' }
  $env:AI_SERVICE_TOKEN = $token

  $backendProcess = Step 'Start backend' { Start-ProjectScript 'Backend' 'scripts\run-backend.ps1' -Hidden }
  $aiProcess = Step 'Start AI service' { Start-ProjectScript 'AI service' 'scripts\run-ai-service.ps1' -Hidden }
  $workerProcess = Step 'Start AI worker' { Start-ProjectScript 'AI worker' 'scripts\run-worker.ps1' -Hidden }
  $frontendProcess = Step 'Start frontend' { Start-ProjectScript 'Frontend' 'scripts\run-frontend.ps1' -Hidden }

  Step 'Check backend health' { Wait-Health 'http://127.0.0.1:4000/health' @{} $backendProcess 'Backend' }
  Step 'Check AI service health' { Wait-Health 'http://127.0.0.1:8000/health' @{ 'x-ai-service-token' = $token } $aiProcess 'AI service' }
  Step 'Check frontend health' { Wait-Health 'http://127.0.0.1:5173/health' @{} $frontendProcess 'Frontend' }
  foreach ($service in @(@('AI worker', $workerProcess), @('Session reminder worker', $reminderProcess))) {
    if ($service[1].HasExited) { throw "$($service[0]) exited during startup. Check docs\runtime-logs." }
  }

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
