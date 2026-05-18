# Environment Files

Use a dedicated environment file per context.

## Production

Create `server/.env` with your production values.
Set `CLIENT_URL` to your frontend domain (`https://www.hokoapp.in`).
If you use multiple frontend domains, set a comma-separated list.

## Development

Create `server/.env.development` with local values.
The dev script already loads it:

```bash
npm run dev
```

## Example

Use `server/.env.example` for production and `server/.env.development.example` for local development.

## Push Notification Keys

Web push requires these variables in the server env:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (example: `mailto:support@hokoapp.in`)

Android native push requires Firebase Admin credentials on the server. Use either:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

Or:

- `FIREBASE_SERVICE_ACCOUNT_PATH`

The default file lookup path is `server/firebase-service-account.json`.

## Deep Link Verification

Android app links and iOS universal links are served from the API server so they can be updated without shipping a new app build.

Set these variables when you are ready to verify hosted links:

- `ANDROID_PACKAGE_NAME` (default: `com.hoko.app`)
- `ANDROID_SHA256_CERT_FINGERPRINTS` as a comma-separated list of release cert fingerprints
- `APPLE_APP_ID_PREFIX` for the iOS team prefix
- `APPLE_BUNDLE_ID` (default: `com.hoko.app`)
- `APPLE_ASSOCIATED_PATHS` as a comma-separated path list

The server exposes:

- `/.well-known/assetlinks.json`
- `/.well-known/apple-app-site-association`

## SMS DLT Templates

Automated SMS in the app now uses Fast2SMS DLT routes only.

- `FAST2SMS_DLT_MESSAGE_ID` is for OTP/login SMS.
- `FAST2SMS_DLT_EVENT_MESSAGE_ID` is for automated event messages that include a deeplink.
- `FAST2SMS_DLT_ENTITY_ID` is the approved DLT principal entity ID used by manual/admin SMS.
- `FAST2SMS_DLT_TEMPLATE_ID` is the approved DLT content template ID used by admin bulk SMS.
- `FAST2SMS_DLT_BULK_TEMPLATE_ID` is also accepted as a backward-compatible alias.

Keep the approved template text in the registry in sync with the variables passed from the server.

## AI Content

The admin AI content and social media draft helpers use Gemini when these variables are set:

- `GEMINI_API_KEY`
- `GEMINI_CONTENT_MODEL` (default: `gemini-2.5-flash`)
- `GEMINI_CAMPAIGN_MODEL` (default: `GEMINI_CONTENT_MODEL`, then `gemini-2.5-flash`)
- `GEMINI_IMAGE_MODEL` (default: `gemini-2.5-flash-image`)
- `AI_CONTENT_GENERATE_IMAGES=true` to generate images for AI content drafts

## Buffer Publishing

Approved AI drafts can be sent to Buffer when these variables are configured:

- `BUFFER_API_KEY`
- `BUFFER_DEFAULT_CHANNEL_ID` optional fallback channel for publishing
- `BUFFER_ORGANIZATION_ID` optional, used when the Buffer account has multiple organizations
