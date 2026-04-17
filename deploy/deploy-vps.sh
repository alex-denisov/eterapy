#!/usr/bin/env bash
# ETerapy Pre-Production Deploy Script
# Deploy to VPS: 192.144.14.146
# Uses: Nginx + Let's Encrypt + PM2 (no Docker for app)
set -euo pipefail

VPS="admin@192.144.14.146"
APP_DIR="/var/www/eterapy"
DOMAINS="eterapy.com www.eterapy.com app.eterapy.com admin.eterapy.com"

log() { echo "[$(date '+%H:%M:%S')] $*"; }

# ── 1. Check SSH ──────────────────────────────────────────────────────
log "Checking SSH access..."
if ! ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no "$VPS" "echo ok" 2>/dev/null; then
  echo "ERROR: Cannot SSH to $VPS"
  echo "Add your public key to the VPS:"
  echo "  ssh-copy-id $VPS"
  exit 1
fi

# ── 2. Install dependencies on VPS ────────────────────────────────────
log "Installing system packages..."
ssh "$VPS" "
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq nodejs npm nginx certbot python3-certbot-nginx git build-essential
  npm install -g pm2
"

# ── 3. Setup Node.js (ensure v22) ─────────────────────────────────────
log "Setting up Node.js 22..."
ssh "$VPS" "
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
  node --version
  npm --version
"

# ── 4. Deploy application code ────────────────────────────────────────
log "Deploying application..."
ssh "$VPS" "
  mkdir -p $APP_DIR
  cd $APP_DIR
  git init -q 2>/dev/null || true
  git remote add origin https://github.com/alex-denisov/eterapy.git 2>/dev/null || true
  git fetch origin main --depth=1
  git reset --hard origin/main
"

# ── 5. Install dependencies and build ─────────────────────────────────
log "Installing dependencies and building..."
ssh "$VPS" "
  cd $APP_DIR/web
  npm ci
  DATABASE_URL=\$DATABASE_URL npx prisma generate
  DATABASE_URL=\$DATABASE_URL npm run build
"

# ── 6. Setup PM2 ──────────────────────────────────────────────────────
log "Starting app with PM2..."
ssh "$VPS" "
  cd $APP_DIR/web
  pm2 delete eterapy 2>/dev/null || true
  pm2 start npm --name eterapy -- start -- --port 3000 --hostname 127.0.0.1
  pm2 save
  pm2 startup systemd -u admin --hp /home/admin
"

# ── 7. Setup Nginx ────────────────────────────────────────────────────
log "Configuring Nginx..."
ssh "$VPS" "
  cat > /etc/nginx/sites-available/eterapy << 'NGINX_EOF'
# HTTP → HTTPS redirect
server {
    listen 80;
    server_name ${DOMAINS};

    location / {
        return 301 https://\$host\$request_uri;
    }

    # Let's Encrypt challenge
    location ~ /.well-known/acme-challenge {
        allow all;
        root /var/www/certbot;
    }
}

# eterapy.com — main domain
server {
    listen 443 ssl http2;
    server_name eterapy.com www.eterapy.com;

    ssl_certificate /etc/letsencrypt/live/eterapy.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/eterapy.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}

# app.eterapy.com — client & practitioner cabinet
server {
    listen 443 ssl http2;
    server_name app.eterapy.com;

    ssl_certificate /etc/letsencrypt/live/eterapy.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/eterapy.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host app.eterapy.com;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}

# admin.eterapy.com — admin panel
server {
    listen 443 ssl http2;
    server_name admin.eterapy.com;

    ssl_certificate /etc/letsencrypt/live/eterapy.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/eterapy.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host admin.eterapy.com;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX_EOF

  ln -sf /etc/nginx/sites-available/eterapy /etc/nginx/sites-enabled/eterapy
  rm -f /etc/nginx/sites-enabled/default
  mkdir -p /var/www/certbot
  nginx -t && systemctl reload nginx
"

# ── 8. Get Let's Encrypt certificate ──────────────────────────────────
log "Obtaining Let's Encrypt certificate..."
ssh "$VPS" "
  certbot --nginx -d ${DOMAINS// /,} --non-interactive --agree-tos --email 890525@gmail.com --redirect
"

# ── 9. Setup auto-renewal ─────────────────────────────────────────────
log "Setting up certbot auto-renewal..."
ssh "$VPS" "
  (crontab -l 2>/dev/null; echo '0 3 * * * certbot renew --quiet --post-hook \"systemctl reload nginx\"') | crontab -
"

# ── 10. Health check ──────────────────────────────────────────────────
log "Running health check..."
sleep 5
HEALTH=$(curl -sk https://eterapy.com/api/health 2>/dev/null || echo "FAILED")
log "Health check: $HEALTH"

log "Deploy complete!"
log "Check:"
log "  https://eterapy.com"
log "  https://app.eterapy.com"
log "  https://admin.eterapy.com"
