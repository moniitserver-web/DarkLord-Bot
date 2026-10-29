@echo off
setlocal
cd /d "%~dp0.."
if "%STARBOX_URL%"=="" set "STARBOX_URL=http://127.0.0.1:3001"
echo BlackLord Windows runner: %STARBOX_URL%
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows-automation-runner.ps1" %*
endlocal
