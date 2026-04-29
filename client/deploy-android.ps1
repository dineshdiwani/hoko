# PowerShell script to build, sync Android and push
Write-Host "Building web app..." -ForegroundColor Cyan
npm run build

Write-Host "Syncing to Android..." -ForegroundColor Cyan
npx cap sync android

Write-Host "Committing and pushing..." -ForegroundColor Cyan
git add android
git commit -m "Sync Android app with web changes"
git push origin main

Write-Host "Done! Android app synced and pushed." -ForegroundColor Green
