@echo off
REM GYM Management System - Application Launcher
REM This script starts the development server and opens the application in your browser

cd /d "%~dp0"

echo.
echo =========================================
echo   GYM Management System
echo   Starting Application...
echo =========================================
echo.

REM Start the Vite dev server in a new window
start "GYM Management - Dev Server" cmd /k "npm run dev"

REM Wait for the server to be ready and open the browser
powershell -NoProfile -Command "Write-Host 'Waiting for server to start...'; for($i=1; $i -le 30; $i++){if((Test-NetConnection -ComputerName 'localhost' -Port 8080 -WarningAction SilentlyContinue).TcpTestSucceeded){Write-Host 'Server is ready! Opening browser...'; Start-Process 'http://localhost:8080/'; exit}; Start-Sleep -Seconds 1}; Write-Host 'Server startup timeout - please check the dev server window'"

echo.
echo Application should now be running at http://localhost:8080/
echo Press Ctrl+C in the dev server window to stop the application
echo.
pause
