#!/usr/bin/env bash
set -euo pipefail

BRANCH="${1:-main}"
APP_NAME="${APP_NAME:-hoko-api}"

cd "$(dirname "$0")/.."

echo "[deploy] branch=$BRANCH cwd=$(pwd)"

git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

install_deps() {
  local target="$1"
  local label="$2"
  if [ -f "$target/package-lock.json" ] || [ "$target" = "." -a -f "package-lock.json" ]; then
    echo "[deploy] Installing $label with npm ci"
    if [ "$target" = "." ]; then
      npm ci || { echo "[deploy] npm ci failed for $label; falling back to npm install"; npm install; }
    else
      npm ci --prefix "$target" || { echo "[deploy] npm ci failed for $label; falling back to npm install"; npm install --prefix "$target"; }
    fi
  else
    echo "[deploy] package-lock.json missing for $label; using npm install"
    if [ "$target" = "." ]; then
      npm install
    else
      npm install --prefix "$target"
    fi
  fi
}

echo "[deploy] Installing dependencies"
install_deps "." "root"
install_deps "server" "server"
install_deps "client" "client"

echo "[deploy] Building client"
GOOGLE_CLIENT_ID_BUILD="${VITE_GOOGLE_CLIENT_ID:-}"
if [ -z "$GOOGLE_CLIENT_ID_BUILD" ] && [ -f .env ]; then
  GOOGLE_CLIENT_ID_BUILD="$(grep -E '^GOOGLE_CLIENT_ID=' .env | tail -n1 | cut -d= -f2- || true)"
fi
if [ -z "$GOOGLE_CLIENT_ID_BUILD" ]; then
  echo "[deploy] ERROR: Missing VITE_GOOGLE_CLIENT_ID (or GOOGLE_CLIENT_ID in .env)."
  echo "[deploy] Google login button will not render without it."
  exit 1
fi
VITE_GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID_BUILD" npm run build --prefix client

if ! command -v pm2 >/dev/null 2>&1; then
  echo "[deploy] pm2 is not installed. Install it once with: npm i -g pm2"
  exit 1
fi

echo "[deploy] Restarting app with PM2"
pm2 startOrReload ecosystem.config.cjs --env production
pm2 save

echo "[deploy] done"
