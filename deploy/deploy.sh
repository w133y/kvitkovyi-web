#!/bin/sh
# Auto-deploy: run every 2 minutes by kvitkovyi-deploy.timer. Rebuilds and
# restarts the site when origin/main has new commits (or with "force").
# The checkout is deploy-only — local edits to tracked files get reset;
# .env is untracked and stays.
set -eu
cd "$(dirname "$0")/.."
exec 9>/tmp/kvitkovyi-deploy.lock
flock -n 9 || exit 0 # a build is already running

git fetch -q origin main
if [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] && [ "${1:-}" != "force" ]; then
  exit 0
fi

git reset -q --hard origin/main
echo "$(date -Is) deploying $(git rev-parse --short HEAD)"
# Build first, while the old container keeps serving; swap only on success.
docker compose build web
docker compose up -d
docker image prune -f >/dev/null
echo "$(date -Is) deployed $(git rev-parse --short HEAD)"
