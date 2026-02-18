# Hoko Deployment

## One-time VPS setup

Run these on your VPS:

```bash
cd /var/www/hoko
npm i -g pm2
pm2 startup
```

Add your app environment file at `/var/www/hoko/.env` with production values.

## GitHub Actions secrets

In GitHub repo settings -> Secrets and variables -> Actions, add:

- `DEPLOY_HOST`: VPS public IP (example: `84.32.84.32`)
- `DEPLOY_USER`: SSH user (example: `root`)
- `DEPLOY_PATH`: app path on server (example: `/var/www/hoko`)
- `DEPLOY_SSH_KEY_B64`: base64-encoded private SSH key content used by GitHub Actions

## Auto deploy

On every push to `main`, workflow `.github/workflows/deploy.yml` will:

1. SSH to VPS
2. Pull latest code
3. Install dependencies
4. Build client (`client/dist`)
5. Restart server via PM2

Manual deploy command on VPS:

```bash
cd /var/www/hoko
bash scripts/deploy.sh main
```

## Google Login Setup (From Zero)

1. Create OAuth Client in Google Cloud Console:
   - Type: `Web application`
   - Add `Authorized JavaScript origins`:
     - `https://www.hokoapp.in`
     - `https://hokoapp.in` (if used)
     - `http://localhost:5173` (local Vite)

2. Set environment variables:
   - Server `.env`: `GOOGLE_CLIENT_ID=<your-web-client-id>`
   - Client build var: `VITE_GOOGLE_CLIENT_ID=<same-client-id>`

3. Deploy:
   - `bash scripts/deploy.sh main`
   - Deploy script injects `VITE_GOOGLE_CLIENT_ID` from server `.env` if needed.

4. Verify:
   - Open `/buyer/login` or `/seller/login`
   - Google button should be visible
   - If One Tap is blocked by browser/session policy, button login should still work
