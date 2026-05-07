# PowerShell script to build, sync Android and push
Write-Host "Building web app..." -ForegroundColor Cyan
npm run build

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

Write-Host "Publishing release APK into public assets..." -ForegroundColor Cyan
$apkSource = "android\app\build\outputs\apk\release\app-release.apk"
$apkTargetDir = "public\apk"
$apkTarget = Join-Path $apkTargetDir "app-release.apk"
if (-not (Test-Path $apkSource)) {
    throw "Release APK not found at $apkSource"
}
New-Item -ItemType Directory -Force -Path $apkTargetDir | Out-Null
Copy-Item $apkSource $apkTarget -Force

Write-Host "Committing and pushing..." -ForegroundColor Cyan
git add android public\apk
git commit -m "Sync Android app with web changes"
git push origin main

Write-Host "Done! APKs built and pushed." -ForegroundColor Green
Write-Host "Debug APK: android\app\build\outputs\apk\debug\app-debug.apk" -ForegroundColor Yellow
Write-Host "Release APK: public\apk\app-release.apk" -ForegroundColor Yellow
