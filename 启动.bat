@echo off
chcp 65001 >nul
cd /d "%~dp0"

if not exist "dist\index.html" (
  echo.
  echo [ERROR] dist not found. Please run build.bat first.
  echo.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [ERROR] Node.js not found in PATH.
  echo.
  pause
  exit /b 1
)

node tools\serve.mjs
pause
