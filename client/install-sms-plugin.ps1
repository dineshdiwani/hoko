# PowerShell script to install and configure SMS retriever plugin
Write-Host "Installing @shaher/capacitor-sms-retriever..." -ForegroundColor Cyan
npm install @shaher/capacitor-sms-retriever

Write-Host "Syncing Capacitor..." -ForegroundColor Cyan
npx cap sync android

Write-Host "Done! Plugin installed and synced." -ForegroundColor Green
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Get app hash: npx cap open android, then run the hash code method" -ForegroundColor Yellow
Write-Host "2. Add hash to your SMS messages from backend" -ForegroundColor Yellow
Write-Host "3. Update UserLogin.jsx to use the plugin" -ForegroundColor Yellow
