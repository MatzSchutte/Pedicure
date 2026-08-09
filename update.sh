#!/bin/bash
# ==========================================================================
# Update-script: Pedicure Bianca Passmann
# Haalt de laatste versie van GitHub op, installeert dependencies opnieuw
# en herstart de service. Maakt eerst automatisch een backup.
#
# Gebruik (op de server, in de map van de app):
#   sudo bash update.sh
# ==========================================================================
set -e

if [ "$EUID" -ne 0 ]; then
  echo "Dit script moet als root (of met sudo) draaien."
  exit 1
fi

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_NAME="pedicure-bianca"
RUN_USER="pedicure"

cd "$APP_DIR"

echo "=========================================================="
echo " Pedicure Bianca Passmann — update"
echo " Map: $APP_DIR"
echo "=========================================================="

# ---------- 1. Backup vooraf ----------
echo ""
echo "[1/5] Backup maken voor de zekerheid..."
if [ -f "scripts/backup.sh" ]; then
  bash scripts/backup.sh || echo "Backup is niet gelukt, ga toch door met updaten."
fi

# ---------- 2. Laatste versie ophalen ----------
echo ""
echo "[2/5] Laatste versie ophalen van GitHub..."
git fetch origin
git reset --hard origin/main
git clean -fd -e data -e backups -e .env

# ---------- 3. Dependencies bijwerken ----------
echo ""
echo "[3/5] npm dependencies bijwerken..."
npm install --omit=dev

# ---------- 4. Bestandsrechten herstellen ----------
echo ""
echo "[4/5] Bestandsrechten herstellen..."
mkdir -p data backups
chown -R "$RUN_USER:$RUN_USER" "$APP_DIR"
[ -f ".env" ] && chmod 600 ".env"

# ---------- 5. Service herstarten ----------
echo ""
echo "[5/5] Service herstarten..."
systemctl restart "$SERVICE_NAME"
sleep 2

echo ""
echo "=========================================================="
systemctl status "$SERVICE_NAME" --no-pager
echo "=========================================================="
echo " Update klaar!"
echo " Logs bekijken: journalctl -u $SERVICE_NAME -f"
echo "=========================================================="
