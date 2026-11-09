@echo off
chcp 65001 >nul
cd /d "%~dp0"

if not exist "node_modules" (
  echo [1/3] Installing dependencies, please wait...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto fail
) else (
  echo [1/3] Dependencies already installed.
)

echo [2/3] Type checking and building...
call npm run build
if errorlevel 1 goto fail

echo.
echo [3/3] Done. Now double-click start.bat to open the app.
echo.
pause
exit /b 0

:fail
echo.
echo [ERROR] Build failed. Please read the messages above.
echo.
pause
exit /b 1
