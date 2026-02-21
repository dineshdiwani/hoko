#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/hoko}"
BRANCH="${BRANCH:-main}"
STASH_ACTION="${STASH_ACTION:-pop}" # pop | drop | keep
LOCK_FILE="${LOCK_FILE:-/tmp/hoko-deploy.lock}"
RETRY_COUNT="${RETRY_COUNT:-3}"
RETRY_DELAY_SEC="${RETRY_DELAY_SEC:-3}"

cd "$APP_DIR"

# Prevent concurrent deploy runs from stepping on node_modules/esbuild.
exec 200>"$LOCK_FILE"
flock -n 200 || {
  echo "Another deploy is already running. Exiting."
  exit 1
}

retry_cmd() {
  local attempts="$1"
  shift
  local n=1
  until "$@"; do
    if [[ "$n" -ge "$attempts" ]]; then
      echo "Command failed after ${attempts} attempts: $*"
      return 1
    fi
    echo "Command failed (attempt ${n}/${attempts}): $*"
    echo "Retrying in ${RETRY_DELAY_SEC}s..."
    sleep "$RETRY_DELAY_SEC"
    n=$((n + 1))
  done
}

# Auto-stash local changes so pull --rebase can proceed on dirty trees.
STASHED=0
STASH_REF=""
STASH_MSG="deploy-autostash-$(date +%Y%m%d-%H%M%S)"
if ! git diff --quiet || ! git diff --cached --quiet || [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
  echo "Local changes detected. Creating stash: ${STASH_MSG}"
  git stash push -u -m "$STASH_MSG" >/dev/null
  STASH_REF="$(git stash list -n 1 --format="%gd")"
  STASHED=1
fi

cp .env /tmp/hoko.env.backup
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --rebase origin "$BRANCH"
cp /tmp/hoko.env.backup .env

rm -rf node_modules client/node_modules server/node_modules

retry_cmd "$RETRY_COUNT" npm install
retry_cmd "$RETRY_COUNT" npm install --prefix server
retry_cmd "$RETRY_COUNT" npm install --prefix client || {
  echo "Client install still failing. Cleaning esbuild and retrying..."
  rm -rf client/node_modules/esbuild client/node_modules/.bin/esbuild
  sleep 2
  retry_cmd "$RETRY_COUNT" npm install --prefix client
}

VITE_GOOGLE_CLIENT_ID="$(grep -E '^GOOGLE_CLIENT_ID=' .env | tail -n1 | cut -d= -f2-)" npm run build --prefix client

pm2 startOrReload ecosystem.config.cjs --env production
pm2 save
pm2 status

if [[ "$STASHED" -eq 1 ]]; then
  case "$STASH_ACTION" in
    pop)
      echo "Restoring stashed local changes (${STASH_REF})..."
      if git stash pop "$STASH_REF"; then
        echo "Stash restored successfully."
      else
        echo "Stash restore had conflicts. Stash entry kept for manual resolution."
      fi
      ;;
    drop)
      echo "Dropping stash (${STASH_REF}) as requested."
      git stash drop "$STASH_REF" || true
      ;;
    keep)
      echo "Keeping stash (${STASH_REF}) as requested."
      ;;
    *)
      echo "Unknown STASH_ACTION='${STASH_ACTION}'. Keeping stash (${STASH_REF})."
      ;;
  esac
fi
