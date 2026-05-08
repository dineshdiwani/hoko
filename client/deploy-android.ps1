# PowerShell script to build, sync Android and push
Write-Host "Building web app..." -ForegroundColor Cyan
npm run build

Write-Host "Cleaning stale Android web assets..." -ForegroundColor Cyan
npm run android:clean

Write-Host "Syncing to Android..." -ForegroundColor Cyan
npx cap sync android

Write-Host "Building debug APK..." -ForegroundColor Cyan
Set-Location -Path "android"
./gradlew.bat assembleDebug
Set-Location -Path ".."

Write-Host "Building release APK..." -ForegroundColor Cyan
Set-Location -Path "android"
./gradlew.bat assembleRelease
Set-Location -Path ".."

Write-Host "Committing and pushing..." -ForegroundColor Cyan
git add android
git commit -m "Sync Android app with web changes"
git push origin main

Write-Host "Done! Android builds created and pushed." -ForegroundColor Green
Write-Host "Debug APK: android\app\build\outputs\apk\debug\app-debug.apk" -ForegroundColor Yellow
Write-Host "Release APK: android\app\build\outputs\apk\release\app-release.apk" -ForegroundColor Yellow
