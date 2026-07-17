#!/usr/bin/env bash
# B473 — from-scratch VM bootstrap. Run ON the VM as root after an OS
# reinstall (Ubuntu 22.04/24.04):
#
#   scp -r deploy/compose root@VM:/opt/eterapy-bootstrap
#   ssh root@VM 'bash /opt/eterapy-bootstrap/bootstrap.sh'
#
# Idempotent: re-running converges (docker install skipped when present,
# compose up -d only restarts what changed). The app image arrives separately
# via the deploy workflow (docker load) or `docker pull` if a registry is used.
set -euo pipefail

ETERAPY_DIR=/opt/eterapy
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "▶ docker engine"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

echo "▶ swap (build-free VMs still need headroom for postgres + node)"
if [ ! -f /swapfile ] && [ "$(free -m | awk '/^Swap/{print $2}')" -lt 1024 ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "▶ /opt/eterapy layout"
mkdir -p "$ETERAPY_DIR/backups"
cp "$SRC_DIR/docker-compose.yml" "$ETERAPY_DIR/docker-compose.yml"
cp "$SRC_DIR/Caddyfile" "$ETERAPY_DIR/Caddyfile"
if [ ! -f "$ETERAPY_DIR/.env" ]; then
  cp "$SRC_DIR/.env.example" "$ETERAPY_DIR/.env"
  # Generate the secrets that must never be defaults.
  sed -i "s#^ETERAPY_DB_PASSWORD=.*#ETERAPY_DB_PASSWORD=$(openssl rand -hex 16)#" "$ETERAPY_DIR/.env"
  DB_PASS=$(grep '^ETERAPY_DB_PASSWORD=' "$ETERAPY_DIR/.env" | cut -d= -f2)
  sed -i "s#^DATABASE_URL=.*#DATABASE_URL=postgresql://eterapy:${DB_PASS}@db:5432/eterapy?schema=public#" "$ETERAPY_DIR/.env"
  sed -i "s#^AUTH_SECRET=.*#AUTH_SECRET=$(openssl rand -base64 32 | tr -d '\n')#" "$ETERAPY_DIR/.env"
  sed -i "s#^CRON_SECRET=.*#CRON_SECRET=$(openssl rand -hex 24)#" "$ETERAPY_DIR/.env"
  echo "  → generated fresh .env (edit $ETERAPY_DIR/.env to change ANY variable)"
else
  echo "  → keeping existing .env"
fi
chmod 600 "$ETERAPY_DIR/.env"

echo "▶ CI deploy key"
# When run via `sudo bash bootstrap.sh`, CI connects as the sudo-ing user
# (e.g. admin), so the key must land in THAT user's authorized_keys.
KEY_USER="${SUDO_USER:-root}"
KEY_HOME="$(getent passwd "$KEY_USER" | cut -d: -f6)"
if [ -f "$SRC_DIR/ci_authorized_key.pub" ] && [ -n "$KEY_HOME" ]; then
  mkdir -p "$KEY_HOME/.ssh" && chmod 700 "$KEY_HOME/.ssh"
  grep -qf "$SRC_DIR/ci_authorized_key.pub" "$KEY_HOME/.ssh/authorized_keys" 2>/dev/null \
    || cat "$SRC_DIR/ci_authorized_key.pub" >> "$KEY_HOME/.ssh/authorized_keys"
  chmod 600 "$KEY_HOME/.ssh/authorized_keys"
  chown -R "$KEY_USER" "$KEY_HOME/.ssh"
fi

echo "▶ start stack (no-op if the app image is not loaded yet)"
cd "$ETERAPY_DIR"
IMAGE=$(grep '^ETERAPY_IMAGE=' .env | cut -d= -f2)
if docker image inspect "$IMAGE" >/dev/null 2>&1; then
  docker compose up -d
  docker compose ps
else
  echo "  → image $IMAGE not present yet; run the deploy workflow (it loads the image and ups the stack)"
fi

echo "✓ bootstrap complete"
