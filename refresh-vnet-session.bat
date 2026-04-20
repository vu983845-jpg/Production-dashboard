@echo off
echo === VNET Session Refresher ===
cd /d "C:\Users\Cashew\.gemini\Dassboard\factory-dashboard"
node vnet-session-refresher.js
if %errorlevel% neq 0 (
  echo FAILED - exit code %errorlevel%
) else (
  echo SUCCESS
)
pause
