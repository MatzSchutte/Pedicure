#!/bin/sh
# Maakt een dagelijkse backup van de SQLite database en bewaart de laatste 30.
# Voorbeeld cron (op de host, of als aparte cron-service in docker-compose):
#   0 3 * * * /pad/naar/scripts/backup.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
DB_FILE="$ROOT_DIR/data/pedicure.sqlite"
BACKUP_DIR="$ROOT_DIR/backups"
TIMESTAMP=$(date +%Y-%m-%d_%H%M%S)

mkdir -p "$BACKUP_DIR"
cp "$DB_FILE" "$BACKUP_DIR/pedicure_$TIMESTAMP.sqlite"

# Bewaar alleen de laatste 30 backups
cd "$BACKUP_DIR"
ls -1t pedicure_*.sqlite 2>/dev/null | tail -n +31 | xargs -r rm --

echo "Backup gemaakt: $BACKUP_DIR/pedicure_$TIMESTAMP.sqlite"
