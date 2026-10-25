@echo off
cd /d "%~dp0"
set ADMIN_PASSWORD=123
REM Serves this PC and the local network only. Do not add ngrok, Cloudflare Tunnel, or router port forwarding unless you want the public internet.
if not exist "dist\index.html" (
  echo Building the site first...
  call npm run build
)
echo Starting MASKA. Keep this window open. Ctrl+C or close the window to stop.
call npm start
pause
