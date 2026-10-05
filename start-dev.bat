@echo off
REM Start the Vite dev server in a new window and open the browser when ready
cd /d "%~dp0"
start "Vite" cmd /k "npm run dev"
powershell -NoProfile -Command "Write-Host 'Waiting for dev server on http://localhost:8080/ ...'; while(-not (Test-NetConnection -ComputerName 'localhost' -Port 8080).TcpTestSucceeded){Start-Sleep -Seconds 1}; Start-Process 'http://localhost:8080/'"
