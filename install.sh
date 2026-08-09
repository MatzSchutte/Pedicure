#!/bin/bash
# ==========================================================================
# Installatiescript: Pedicure Bianca Passmann
# Voor gebruik op een verse Proxmox LXC (Debian/Ubuntu).
#
# Gebruik:
#   git clone <jouw-github-repo-url> pedicure-bianca
#   cd pedicure-bianca
#   sudo bash install.sh
# ==========================================================================
set -e

if [ "$EUID" -ne 0 ]; then
  echo "Dit script moet als root (of met sudo) draaien."
  exit 1
fi

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_NAME="pedicure-bianca"
RUN_USER="pedicure"

echo "=========================================================="
echo " Pedicure Bianca Passmann — installatie"
echo " Map: $APP_DIR"
echo "=========================================================="

# ---------- 1. Systeempakketten ----------
echo ""
echo "[1/8] Systeempakketten installeren..."
apt-get update -y
apt-get install -y curl git build-essential python3 sqlite3 nginx openssl ufw

if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  echo "Node.js 20 wordt geïnstalleerd..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
else
  echo "Node.js is al aanwezig: $(node -v)"
fi

# ---------- 2. Aparte systeemgebruiker ----------
echo ""
echo "[2/8] Systeemgebruiker '$RUN_USER' controleren..."
if ! id "$RUN_USER" >/dev/null 2>&1; then
  useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$RUN_USER"
fi

# ---------- 3. npm dependencies ----------
echo ""
echo "[3/8] npm dependencies installeren (dit kan even duren)..."
cd "$APP_DIR"
npm install --omit=dev

mkdir -p data backups
chown -R "$RUN_USER:$RUN_USER" "$APP_DIR"

# ---------- 4. .env instellen ----------
echo ""
echo "[4/8] Configuratie (.env)..."
if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
fi

read -rp "Poort voor de applicatie [3000]: " APP_PORT
APP_PORT=${APP_PORT:-3000}

read -rp "Gebruikersnaam voor Bianca's adminpanel [bianca]: " ADMIN_USER
ADMIN_USER=${ADMIN_USER:-bianca}

while true; do
  read -rsp "Kies een wachtwoord voor het adminpanel: " ADMIN_PASS
  echo ""
  read -rsp "Herhaal het wachtwoord: " ADMIN_PASS2
  echo ""
  [ "$ADMIN_PASS" = "$ADMIN_PASS2" ] && [ -n "$ADMIN_PASS" ] && break
  echo "Wachtwoorden komen niet overeen of zijn leeg, probeer opnieuw."
done

ADMIN_HASH=$(node scripts/create-admin.js "$ADMIN_PASS" | grep ADMIN_PASSWORD_HASH | cut -d= -f2-)
SESSION_SECRET=$(openssl rand -hex 32)

read -rp "Domeinnaam voor de website (bijv. pedicurebianca.nl), leeg = alleen lokaal testen: " DOMAIN

# .env bijwerken (regel vervangen als de key bestaat, anders toevoegen)
set_env () {
  local key="$1" value="$2"
  if grep -q "^${key}=" "$APP_DIR/.env"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$APP_DIR/.env"
  else
    echo "${key}=${value}" >> "$APP_DIR/.env"
  fi
}
set_env "PORT" "$APP_PORT"
set_env "NODE_ENV" "production"
set_env "ADMIN_USERNAME" "$ADMIN_USER"
set_env "ADMIN_PASSWORD_HASH" "$ADMIN_HASH"
set_env "SESSION_SECRET" "$SESSION_SECRET"
chown "$RUN_USER:$RUN_USER" "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"

echo ""
echo "SMTP-instellingen zijn optioneel (voor bevestigingsmails)."
read -rp "SMTP host (leeg = overslaan): " SMTP_HOST
if [ -n "$SMTP_HOST" ]; then
  read -rp "SMTP poort [587]: " SMTP_PORT
  SMTP_PORT=${SMTP_PORT:-587}
  read -rp "SMTP gebruikersnaam: " SMTP_USER
  read -rsp "SMTP wachtwoord: " SMTP_PASSWORD
  echo ""
  set_env "SMTP_HOST" "$SMTP_HOST"
  set_env "SMTP_PORT" "$SMTP_PORT"
  set_env "SMTP_USER" "$SMTP_USER"
  set_env "SMTP_PASSWORD" "$SMTP_PASSWORD"
fi

# ---------- 5. systemd-service ----------
echo ""
echo "[5/8] systemd-service aanmaken..."
cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=Pedicure Bianca Passmann
After=network.target

[Service]
Type=simple
User=${RUN_USER}
WorkingDirectory=${APP_DIR}
ExecStart=$(command -v node) ${APP_DIR}/server/index.js
EnvironmentFile=${APP_DIR}/.env
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=${APP_DIR}/data ${APP_DIR}/backups

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

# ---------- 6. Nginx ----------
echo ""
echo "[6/8] Nginx configureren..."
if [ -n "$DOMAIN" ]; then
  cat > "/etc/nginx/sites-available/${SERVICE_NAME}" <<EOF
server {
    listen 80;
    server_name ${DOMAIN};

    client_max_body_size 2m;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location ~* \.sqlite\$ {
        deny all;
        return 404;
    }
}
EOF
  ln -sf "/etc/nginx/sites-available/${SERVICE_NAME}" "/etc/nginx/sites-enabled/${SERVICE_NAME}"
  rm -f /etc/nginx/sites-enabled/default
  nginx -t && systemctl reload nginx

  echo ""
  read -rp "Nu HTTPS instellen via Let's Encrypt (certbot)? Domein moet al naar dit adres wijzen [j/N]: " DO_CERTBOT
  if [[ "$DO_CERTBOT" =~ ^[jJ]$ ]]; then
    apt-get install -y certbot python3-certbot-nginx
    certbot --nginx -d "$DOMAIN" --redirect --non-interactive --agree-tos -m "admin@${DOMAIN}" || \
      echo "Certbot is niet gelukt. Zorg dat het domein DNS naar dit IP wijst en probeer later: certbot --nginx -d ${DOMAIN}"
  fi
else
  echo "Geen domein opgegeven, Nginx wordt niet geconfigureerd. De app draait lokaal op poort ${APP_PORT}."
fi

# ---------- 7. Firewall ----------
echo ""
echo "[7/8] Firewall (ufw) instellen..."
ufw allow OpenSSH >/dev/null 2>&1 || true
ufw allow 'Nginx Full' >/dev/null 2>&1 || true
ufw --force enable >/dev/null 2>&1 || true

# ---------- 8. Dagelijkse backup ----------
echo ""
echo "[8/8] Dagelijkse backup-cron instellen (03:00)..."
chmod +x "$APP_DIR/scripts/backup.sh"
CRON_LINE="0 3 * * * $RUN_USER $APP_DIR/scripts/backup.sh >> $APP_DIR/backups/backup.log 2>&1"
echo "$CRON_LINE" > "/etc/cron.d/${SERVICE_NAME}-backup"
chmod 644 "/etc/cron.d/${SERVICE_NAME}-backup"

echo ""
echo "=========================================================="
echo " Installatie klaar!"
echo "=========================================================="
echo " Service status:   systemctl status $SERVICE_NAME"
echo " Logs bekijken:    journalctl -u $SERVICE_NAME -f"
echo " Adminpanel:        https://${DOMAIN:-<server-ip>:$APP_PORT}/admin"
echo " Gebruikersnaam:    $ADMIN_USER"
echo "=========================================================="
