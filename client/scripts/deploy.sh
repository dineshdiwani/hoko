#!/bin/bash
# Shell script to build, sync Android and push

echo -e "\033[0;36mBuilding web app...\033[0m"
npm run build

echo -e "\033[0;36mCleaning stale Android web assets...\033[0m"
npm run android:clean

echo -e "\033[0;36mSyncing to Android...\033[0m"
npx cap sync android

echo -e "\033[0;36mBuilding debug APK...\033[0m"
cd android
./gradlew assembleDebug
cd ..

echo -e "\033[0;36mBuilding release APK...\033[0m"
cd android
./gradlew assembleRelease
cd ..

echo -e "\033[0;36mCommitting and pushing...\033[0m"
git add android
git commit -m "Sync Android app with web changes"
git push origin main

echo -e "\033[0;32mDone! Android builds created and pushed.\033[0m"
echo -e "\033[0;33mDebug APK: android/app/build/outputs/apk/debug/app-debug.apk\033[0m"
echo -e "\033[0;33mRelease APK: android/app/build/outputs/apk/release/app-release.apk\033[0m"
