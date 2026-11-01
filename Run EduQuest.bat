@echo off
setlocal
set "ROOT=C:\Users\User\Desktop\IT project build"
set "LOG=%ROOT%\docs\eduquest-launch.log"
if not exist "%ROOT%\" (
  echo FAILED: project folder does not exist: %ROOT%
  pause
  exit /b 1
)
if /I "%~1"=="--dry-run" (
  echo STEP: dry run
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\Start-EduQuest.ps1" -DryRun > "%LOG%" 2>&1
  set "RC=%ERRORLEVEL%"
  type "%LOG%"
  if not "%RC%"=="0" echo FAILED: dry run failed. See %LOG%.
  pause
  exit /b %RC%
)
echo Command: powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\Start-EduQuest.ps1"
call powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\Start-EduQuest.ps1" > "%LOG%" 2>&1
set "RC=%ERRORLEVEL%"
type "%LOG%"
if not "%RC%"=="0" echo FAILED: EduQuest launcher failed. See %LOG%.
pause
exit /b %RC%
