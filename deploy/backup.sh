#!/bin/sh
# Backup diário do PostgreSQL (cron: 0 2 * * * /srv/restgest/deploy/backup.sh)
# Retenção local de 30 dias; cópia fora da VPS com rclone (configurar o remoto BACKUP_REMOTE).
set -eu
BACKUP_DIR=${BACKUP_DIR:-/var/backups/restgest}
BACKUP_REMOTE=${BACKUP_REMOTE:-}          # ex.: "b2:restgest-backups"
. /srv/restgest/.env                       # DATABASE_URL
mkdir -p "$BACKUP_DIR"
FILE="$BACKUP_DIR/restgest-$(date -u +%Y%m%d-%H%M).dump"
pg_dump --format=custom --no-owner "$DATABASE_URL" > "$FILE"
find "$BACKUP_DIR" -name 'restgest-*.dump' -mtime +30 -delete
if [ -n "$BACKUP_REMOTE" ]; then
  rclone copy "$FILE" "$BACKUP_REMOTE" && rclone delete --min-age 30d "$BACKUP_REMOTE"
else
  echo "AVISO: BACKUP_REMOTE vazio — sem cópia fora da VPS" >&2
fi
