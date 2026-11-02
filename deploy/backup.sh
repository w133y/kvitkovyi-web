#!/bin/sh
# Database backup, run every 2 days by kvitkovyi-backup.timer. Old backups go
# only after a new one succeeded, so a failing run never eats the last good copies.
set -eu
cd "$(dirname "$0")/.."
umask 077
DIR=/root/backups
FILE="$DIR/kvitkovyi-$(date +%Y%m%d-%H%M).dump"
mkdir -p "$DIR"
trap 'rm -f "$FILE.tmp"' EXIT

docker compose exec -T db pg_dump -U kvitkovyi -Fc kvitkovyi > "$FILE.tmp"
# A cut-off dump must not pass as a good backup.
docker compose exec -T db pg_restore --list < "$FILE.tmp" > /dev/null

mv "$FILE.tmp" "$FILE"
find "$DIR" -maxdepth 1 -type f -name 'kvitkovyi-*.dump' -mtime +6 -delete
echo "$(date -Is) backup $(basename "$FILE"): $(du -h "$FILE" | cut -f1), kept: $(ls "$DIR" | wc -l)"
