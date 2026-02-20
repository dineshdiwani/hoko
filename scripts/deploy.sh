#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/hoko}"
BRANCH="${BRANCH:-main}"
STASH_ACTION="${STASH_ACTION:-pop}" # pop | drop | keep

cd "$APP_DIR"

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

npm install
npm install --prefix server
npm install --prefix client

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
