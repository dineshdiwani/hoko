#!/bin/bash
# Shell script to build, sync Android and push

echo -e "\033[0;36mBuilding web app...\033[0m"
npm run build

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

echo -e "\033[0;36mPublishing release APK into public assets...\033[0m"
if [[ ! -f android/app/build/outputs/apk/release/app-release.apk ]]; then
  echo "Release APK not found at android/app/build/outputs/apk/release/app-release.apk"
  exit 1
fi
mkdir -p public/apk
cp android/app/build/outputs/apk/release/app-release.apk public/apk/app-release.apk

echo -e "\033[0;36mCommitting and pushing...\033[0m"
git add android public/apk
git commit -m "Sync Android app with web changes"
git push origin main

echo -e "\033[0;32mDone! APKs built and pushed.\033[0m"
echo -e "\033[0;33mDebug APK: android/app/build/outputs/apk/debug/app-debug.apk\033[0m"
echo -e "\033[0;33mRelease APK: public/apk/app-release.apk\033[0m"
