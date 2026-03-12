# Play Store Release Checklist

## Store Identity

- Confirm final package name: `com.hoko.app`
- Confirm app name: `HOKO`
- Confirm support email, privacy policy URL, and website URL

## Android Build

- Set `HOKO_VERSION_CODE` and `HOKO_VERSION_NAME` in [gradle.properties](/abs/path/D:/hoko/client/android/gradle.properties)
- Create `client/android/keystore.properties` from [keystore.properties.example](/abs/path/D:/hoko/client/android/keystore.properties.example)
- Keep the keystore file outside git
- Run:

```bash
npm.cmd run android:sync --prefix client
cd client\\android
gradlew.bat bundleRelease
```

## Device Validation

- Test buyer login
- Test seller login
- Test Google sign-in on a physical Android phone
- Test requirement creation
- Test offer submission
- Test chat and socket reconnect
- Test file upload and attachment open
- Test share links open the public `https://hokoapp.in` URL

## Required Policy / Compliance

- Publish privacy policy URL in Play Console
- Confirm account deletion flow if required by your app category
- Review Play Console declarations for data safety, permissions, and ads

## Assets for Play Console

- App icon: already scaffolded in Android project
- Feature graphic: 1024 x 500
- Phone screenshots
- App description
- Short description

## Recommended Next Improvements

- Add Firebase native push notifications
- Add a native-safe Google auth flow if WebView login is unreliable
- Add Android deep link intent filters for `hokoapp.in`
