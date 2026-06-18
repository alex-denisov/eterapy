#!/usr/bin/env bash
# ETerapy idempotent deploy script
# Usage: ./deploy.sh [--skip-ssl]
# Safe to run multiple times — always converges to desired state.
set -euo pipefail

DOMAIN="eterapy.com"
EMAIL="890525@gmail.com"
APP_DIR="/opt/eterapy"
REPO_URL="https://github.com/alex-denisov/eterapy.git"
COMPOSE_FILE="$APP_DIR/docker-compose.yml"
ENV_FILE="$APP_DIR/.env"
SKIP_SSL="${1:-}"

log() { echo "[$(date '+%H:%M:%S')] $*"; }
step() { echo; echo "▶ $*"; }

# ── 1. System packages ────────────────────────────────────────────────────────
step "System: packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  ca-certificates curl gnupg git ufw fail2ban

# ── 2. Docker ─────────────────────────────────────────────────────────────────
step "Docker"
if ! command -v docker &>/dev/null; then
  log "Installing Docker..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable --now docker
  log "Docker installed: $(docker --version)"
else
  log "Docker already installed: $(docker --version)"
fi

# ── 3. App directory + repo ───────────────────────────────────────────────────
step "Repository"
if [ -d "$APP_DIR/.git" ]; then
  log "Updating existing repo..."
  git -C "$APP_DIR" fetch --all
  git -C "$APP_DIR" reset --hard origin/main
  git -C "$APP_DIR" clean -fd
else
  log "Cloning repo..."
  git clone "$REPO_URL" "$APP_DIR"
fi

# ── 4. Environment file ───────────────────────────────────────────────────────
step "Environment"
if [ ! -f "$ENV_FILE" ]; then
  log "Creating .env from template..."
  cat > "$ENV_FILE" << 'ENVEOF'
AUTH_SECRET=REPLACE_ME
AUTH_TRUST_HOST=true
OPENROUTER_API_KEY=REPLACE_ME
OPENAI_API_KEY=REPLACE_ME
ANTHROPIC_API_KEY=
YANDEX_API_KEY=
YANDEX_FOLDER_ID=
YANDEX_API_BASE=https://llm.api.cloud.yandex.net/foundationModels/v1
ENVEOF
  log "⚠  Edit $ENV_FILE with real secrets before continuing"
  exit 1
else
  log ".env already exists — skipping (to reset: rm $ENV_FILE)"
fi

# ── 5. Firewall ───────────────────────────────────────────────────────────────
step "Firewall (ufw)"
ufw --force reset > /dev/null
ufw default deny incoming > /dev/null
ufw default allow outgoing > /dev/null
ufw allow 22/tcp comment "SSH" > /dev/null
ufw allow 80/tcp comment "HTTP" > /dev/null
ufw allow 443/tcp comment "HTTPS" > /dev/null
ufw --force enable > /dev/null
log "ufw: $(ufw status | head -1)"

# ── 6. Build + start services ─────────────────────────────────────────────────
step "Docker Compose: build + up"
cd "$APP_DIR"
docker compose --env-file "$ENV_FILE" build --pull
docker compose --env-file "$ENV_FILE" up -d --remove-orphans
log "Services running:"
docker compose ps

# ── 7. SSL certificate ────────────────────────────────────────────────────────
if [ "$SKIP_SSL" != "--skip-ssl" ]; then
  step "SSL: Let's Encrypt"
  CERT_PATH="/var/lib/docker/volumes/eterapy_certbot-conf/_data/live/$DOMAIN/fullchain.pem"

  NEED_CERT=1
  if [ -f "$CERT_PATH" ]; then
    if openssl x509 -in "$CERT_PATH" -text -noout | grep -q "DNS:app.$DOMAIN" \
      && openssl x509 -in "$CERT_PATH" -text -noout | grep -q "DNS:admin.$DOMAIN"; then
      NEED_CERT=0
      log "Certificate already covers apex + app/admin subdomains"
    else
      log "Existing certificate is missing app/admin SANs — expanding it"
    fi
  fi

  if [ "$NEED_CERT" -eq 1 ]; then
    log "Requesting certificate for $DOMAIN, www.$DOMAIN, app.$DOMAIN, admin.$DOMAIN..."
    sleep 5
    docker compose run --rm certbot certonly \
      --webroot \
      --webroot-path=/var/www/certbot \
      --email "$EMAIL" \
      --agree-tos \
      --no-eff-email \
      --cert-name "$DOMAIN" \
      --expand \
      -d "$DOMAIN" \
      -d "www.$DOMAIN" \
      -d "app.$DOMAIN" \
      -d "admin.$DOMAIN"
    log "Certificate issued/expanded"
  fi

  # Activate HTTPS nginx config
  SSL_CONF="$APP_DIR/nginx/conf.d/eterapy-ssl.conf"
  if [ ! -f "$SSL_CONF" ]; then
    log "Activating HTTPS nginx config..."
    cp "$APP_DIR/nginx/conf.d/eterapy-ssl.conf.template" "$SSL_CONF"
    docker compose exec nginx nginx -s reload
    log "Nginx reloaded with SSL config"
  else
    log "SSL nginx config already active"
  fi
fi

# ── 8. Health check ───────────────────────────────────────────────────────────
step "Health check"
MAX_WAIT=60
WAITED=0
until curl -sf http://localhost:3000/api/health > /dev/null 2>&1; do
  if [ $WAITED -ge $MAX_WAIT ]; then
    log "ERROR: health check timed out after ${MAX_WAIT}s"
    docker compose logs web --tail=30
    exit 1
  fi
  sleep 3
  WAITED=$((WAITED + 3))
done
log "✓ App is healthy at http://localhost:3000/api/health"

step "Deploy complete"
log "Site: https://$DOMAIN"
log "Run 'docker compose logs -f' to tail logs"
