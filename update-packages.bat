@echo off
setlocal
pushd "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\update-packages.ps1" %*
set "toolResult=%errorlevel%"
popd
exit /b %toolResult%
