@echo off
cd /d "c:\Users\Cashew\.gemini\PPE\factory-dashboard"
git add -A
git commit -m "Fix report: load departments from DB instead of hardcoded codes"
git push
echo Done!
