#!/usr/bin/env bash
# Eterapy production deploy — push-style rsync from local to VPS.
#
# This is the ONLY correct deploy script for the current production topology
# (PM2 single-instance, system nginx, /home/admin/eterapy/web, no Docker for
# the app, no .git on the VPS). See ../DEPLOY.md for full operational notes.
#
# Usage:
#   deploy/sync-prod.sh                # routine code deploy + migrate + restart
#   deploy/sync-prod.sh --dry-run      # show what rsync would push, do nothing
#   deploy/sync-prod.sh --skip-build   # skip the local build step (already built)
#
set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────────────
VPS_HOST="${VPS_HOST:-admin@192.144.14.146}"
APP_DIR_REMOTE="/home/admin/eterapy/web"
DEPLOY_DIR_REMOTE="/home/admin/eterapy/deploy"
DB_CREDS_REMOTE="/home/admin/db-creds.txt"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL_WEB_DIR="$REPO_ROOT/web"
LOCAL_ECOSYSTEM="$REPO_ROOT/deploy/ecosystem.config.js"
SSH_KEY="${SSH_KEY:-$REPO_ROOT/deploy/eTerapy_web}"
SSH_OPTS=(-i "$SSH_KEY" -o IdentitiesOnly=yes -o ConnectTimeout=10)

DRY_RUN=0
SKIP_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --dry-run)    DRY_RUN=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    -h|--help)    sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "Unknown arg: $arg" >&2; exit 2 ;;
  esac
done

log()  { echo "[$(date '+%H:%M:%S')] $*"; }
step() { echo; echo "▶ $*"; }

# ── 1. Pre-flight ────────────────────────────────────────────────────────────
step "Pre-flight"

if [ ! -f "$SSH_KEY" ]; then
  echo "ERROR: SSH key not found at $SSH_KEY." >&2
  exit 1
fi
chmod 600 "$SSH_KEY"

if ! ssh "${SSH_OPTS[@]}" -o BatchMode=yes "$VPS_HOST" "echo ok" > /dev/null 2>&1; then
  echo "ERROR: cannot SSH to $VPS_HOST with key $SSH_KEY." >&2
  exit 1
fi

if [ ! -d "$LOCAL_WEB_DIR" ]; then
  echo "ERROR: $LOCAL_WEB_DIR not found." >&2
  exit 1
fi
if [ ! -f "$LOCAL_ECOSYSTEM" ]; then
  echo "ERROR: $LOCAL_ECOSYSTEM not found." >&2
  exit 1
fi

if ! ssh "${SSH_OPTS[@]}" "$VPS_HOST" "test -f $DB_CREDS_REMOTE"; then
  echo "ERROR: $DB_CREDS_REMOTE missing on VPS — bootstrap not complete." >&2
  exit 1
fi

# ── 2. Local build (catch type errors before they touch prod) ───────────────
if [ "$SKIP_BUILD" -eq 0 ]; then
  step "Local lint + build"
  ( cd "$LOCAL_WEB_DIR" && npm run lint && npm run build )
else
  log "Skipping local build (--skip-build)"
fi

# ── 3. Push code ─────────────────────────────────────────────────────────────
step "Rsync to $VPS_HOST:$APP_DIR_REMOTE"

RSYNC_OPTS=(
  -az --delete
  -e "ssh -i $SSH_KEY -o IdentitiesOnly=yes"
  --exclude='.env' --exclude='.env.*'
  --exclude='node_modules'
  --exclude='.next'
  --exclude='.git'
  --exclude='public/uploads'
  --exclude='*.log'
  --exclude='.DS_Store'
)
[ "$DRY_RUN" -eq 1 ] && RSYNC_OPTS+=(--dry-run -v)

ssh "${SSH_OPTS[@]}" "$VPS_HOST" "mkdir -p $DEPLOY_DIR_REMOTE"
ECOSYSTEM_RSYNC_OPTS=(-az -e "ssh -i $SSH_KEY -o IdentitiesOnly=yes")
[ "$DRY_RUN" -eq 1 ] && ECOSYSTEM_RSYNC_OPTS+=(--dry-run -v)
rsync "${ECOSYSTEM_RSYNC_OPTS[@]}" "$LOCAL_ECOSYSTEM" "$VPS_HOST:$DEPLOY_DIR_REMOTE/ecosystem.config.js"
rsync "${RSYNC_OPTS[@]}" "$LOCAL_WEB_DIR/" "$VPS_HOST:$APP_DIR_REMOTE/"

if [ "$DRY_RUN" -eq 1 ]; then
  log "Dry run complete — nothing changed on VPS."
  exit 0
fi

# ── 4. Install + migrate + build + restart on VPS ───────────────────────────
step "Remote install + migrate + build + restart"

ssh "${SSH_OPTS[@]}" "$VPS_HOST" bash -se <<'REMOTE'
set -euo pipefail
cd /home/admin/eterapy/web
# shellcheck disable=SC1091
source /home/admin/db-creds.txt
export DATABASE_URL

echo "▶ npm ci"
npm ci

echo "▶ prisma generate + migrate deploy"
npx prisma generate
npx prisma migrate deploy

echo "▶ next build"
npm run build

echo "▶ pm2 startOrReload web + worker"
pm2 startOrReload /home/admin/eterapy/deploy/ecosystem.config.js --update-env
pm2 save
REMOTE

# ── 5. Probe ────────────────────────────────────────────────────────────────
step "Health probe"
sleep 3
HEALTH="$(curl -s -o /dev/null -w '%{http_code}' https://eterapy.com/api/health || echo 000)"
APP_HOME="$(curl -s -o /dev/null -w '%{http_code}' https://app.eterapy.com   || echo 000)"
ADM_HOME="$(curl -s -o /dev/null -w '%{http_code}' https://admin.eterapy.com || echo 000)"
log "eterapy.com/api/health → $HEALTH"
log "app.eterapy.com        → $APP_HOME"
log "admin.eterapy.com      → $ADM_HOME"
WORKER_STATUS="$(ssh "${SSH_OPTS[@]}" "$VPS_HOST" "pm2 jlist" | node -e 'let data=\"\";process.stdin.on(\"data\",c=>data+=c);process.stdin.on(\"end\",()=>{const apps=JSON.parse(data);const w=apps.find(a=>a.name===\"eterapy-worker\");process.stdout.write(w?.pm2_env?.status || \"missing\")})')"
log "eterapy-worker PM2    → $WORKER_STATUS"

if [ "$HEALTH" != "200" ]; then
  echo "ERROR: health check failed. Inspect logs:" >&2
  echo "  ssh $VPS_HOST 'pm2 logs eterapy --lines 100 --nostream'" >&2
  exit 1
fi
if [ "$WORKER_STATUS" != "online" ]; then
  echo "ERROR: worker is not online. Inspect logs:" >&2
  echo "  ssh -i $SSH_KEY -o IdentitiesOnly=yes $VPS_HOST 'pm2 logs eterapy-worker --lines 100 --nostream'" >&2
  exit 1
fi

step "Deploy complete"
log "Remember to: (1) append a Session journal line to BACKLOG.md, (2) walk the changed flow in a real browser before marking [x]."
