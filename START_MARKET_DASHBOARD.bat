@echo off
setlocal
cd /d "%~dp0"
title Financial OS - Local Market Dashboard

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0viewer\update-and-open.ps1"
if errorlevel 1 (
  echo.
  echo The dashboard could not be opened. See the message above.
  pause
)

endlocal
