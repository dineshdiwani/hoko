@echo off
cd /d "D:\hoko\client"
call npm run build
call npx cap sync android
echo.
echo Android sync complete!
pause
