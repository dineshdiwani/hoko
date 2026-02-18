#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/hoko}"
BRANCH="${BRANCH:-main}"

cd "$APP_DIR"

cp .env /tmp/hoko.env.backup
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --rebase origin "$BRANCH"
cp /tmp/hoko.env.backup .env

rm -rf node_modules client/node_modules server/node_modules

npm install
npm install --prefix server
npm install --prefix client

VITE_GOOGLE_CLIENT_ID="$(grep -E '^GOOGLE_CLIENT_ID=' .env | tail -n1 | cut -d= -f2-)" npm run build --prefix client

pm2 startOrReload ecosystem.config.cjs --env production
pm2 save
pm2 status
