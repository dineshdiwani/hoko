# Android Build Notes

This project now includes a Capacitor Android wrapper in `client/android`.

## Current app ID

`com.hoko.app`

Change it in [capacitor.config.json](/abs/path/D:/hoko/client/capacitor.config.json) before Play Store release if you want a different package name.

## Prerequisites

- Android Studio
- Android SDK Platform + Build Tools
- JDK 17

## Recommended environment file

Create `client/.env.production` or copy from `.env.android.example` with:

```bash
VITE_API_URL=https://hokoapp.in
VITE_SOCKET_URL=https://hokoapp.in
VITE_PUBLIC_APP_URL=https://hokoapp.in
VITE_GOOGLE_CLIENT_ID=your-google-client-id
```

These values matter for Android because the app runs inside a native WebView and must call the live hosted backend, not `capacitor://localhost`.

## Commands

Run these from the repo root `D:\hoko`:

Sync web code into Android:

```bash
npm run android:sync --prefix client
```

Open Android Studio:

```bash
npm run android:open --prefix client
```

Run on a connected device/emulator:

```bash
npm run android:run --prefix client
```

## Release build

Run this from `D:\hoko\client\android`:

```bash
gradlew.bat bundleRelease
```

That generates the Play Store upload bundle:

```text
client/android/app/build/outputs/bundle/release/app-release.aab
```

## Before Play Store upload

- Replace launcher icons and splash assets with production branding in Android Studio.
- Create a signing keystore and configure signing in `client/android/app/build.gradle`.
- Test login, uploads, downloads, socket connections, and sharing on a real Android device.

## Signing setup

1. Create a keystore, for example:

```bash
keytool -genkeypair -v -keystore hoko-upload-keystore.jks -alias hoko-upload -keyalg RSA -keysize 2048 -validity 10000
```

2. Copy [keystore.properties.example](/abs/path/D:/hoko/client/android/keystore.properties.example) to `client/android/keystore.properties`.

3. Update `storeFile`, `storePassword`, `keyAlias`, and `keyPassword`.

4. Put the keystore file in a safe location outside git, for example `client/keystore/hoko-upload-keystore.jks`.

## Versioning

Android release versioning is controlled in [gradle.properties](/abs/path/D:/hoko/client/android/gradle.properties):

```text
HOKO_VERSION_CODE=1
HOKO_VERSION_NAME=1.0.0
```

Increase `HOKO_VERSION_CODE` for every Play Store upload.

## Known gaps before production mobile release

- Web Push notifications in the current app do not become native Android push automatically. For Play Store quality, add Firebase/Capacitor push notifications.
- Google login inside a WebView can require a native or browser-based mobile auth flow. Test it on-device before publishing.
- Social previews still depend on the public hosted website URL, which is correct for shared links from the app.
