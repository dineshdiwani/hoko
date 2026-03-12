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
VITE_ENABLE_NATIVE_PUSH=true
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

- Google login inside a WebView can require a native or browser-based mobile auth flow. Test it on-device before publishing.
- Social previews still depend on the public hosted website URL, which is correct for shared links from the app.

## Firebase Push Setup

Android background/system notifications require Firebase. The repo is wired for it, but you must provide the credentials.

### Android app file

Put your Firebase Android config here:

```text
client/android/app/google-services.json
```

The package name inside Firebase must match:

```text
com.hoko.app
```

### Client env

Set this in `client/.env.production` for Android builds:

```bash
VITE_ENABLE_NATIVE_PUSH=true
```

### Server env

Add one of these to the server:

Option 1:

```bash
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Option 2:

```bash
FIREBASE_SERVICE_ACCOUNT_PATH=server/firebase-service-account.json
```

### Build and deploy order

1. Place `google-services.json`
2. Configure server Firebase env or `firebase-service-account.json`
3. Deploy server
4. Rebuild Android APK/AAB
5. Log in on the device once so the app can register its native token

### Verification

- Admin Operations -> Push Health should show Firebase as configured
- Native token counts should be greater than zero after device login
- Browser VAPID status and Android Firebase status are separate
