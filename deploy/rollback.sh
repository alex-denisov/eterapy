#!/usr/bin/env bash
# Eterapy production rollback.
#
# Rolling back has two independent axes:
#   1. CODE  — revert to the last good commit and re-deploy
#   2. DB    — restore from a pre-migrate backup (destructive; use only when
#              the migration itself caused the incident)
#
# Usage:
#   deploy/rollback.sh --code <sha>          # revert code to <sha>, redeploy
#   deploy/rollback.sh --db  <backup-file>   # restore DB from a .sql.gz backup
#   deploy/rollback.sh --list-backups        # list available DB backups on VPS
#
# In most incidents you only need --code.  --db restores the pre-migration
# state and also requires a matching code rollback.
#
# WARNING: --db is DESTRUCTIVE. It drops all data written after the backup was
# taken. Coordinate with the team before running.
#
set -euo pipefail

VPS_HOST="${VPS_HOST:-admin@192.144.14.146}"
APP_DIR_REMOTE="/home/admin/eterapy/web"
DEPLOY_DIR_REMOTE="/home/admin/eterapy/deploy"
BACKUP_DIR_REMOTE="/home/admin/eterapy/backups"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SSH_KEY="${SSH_KEY:-$REPO_ROOT/deploy/eTerapy_web}"
SSH_OPTS=(-i "$SSH_KEY" -o IdentitiesOnly=yes -o ConnectTimeout=10)
DB_CREDS_REMOTE="/home/admin/db-creds.txt"

log()  { echo "[$(date '+%H:%M:%S')] $*"; }
step() { echo; echo "▶ $*"; }
err()  { echo "ERROR: $*" >&2; exit 1; }

ROLLBACK_SHA=""
ROLLBACK_DB=""
LIST_BACKUPS=0

for arg in "$@"; do
  case "$arg" in
    --code)         shift; ROLLBACK_SHA="${1:-}"; shift ;;
    --db)           shift; ROLLBACK_DB="${1:-}";  shift ;;
    --list-backups) LIST_BACKUPS=1 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) err "Unknown arg: $arg" ;;
  esac
done

if [ "$LIST_BACKUPS" -eq 1 ]; then
  step "Available DB backups on VPS"
  ssh "${SSH_OPTS[@]}" "$VPS_HOST" "ls -lhrt $BACKUP_DIR_REMOTE/pre-migrate-*.sql.gz 2>/dev/null || echo '(none)'"
  exit 0
fi

if [ -z "$ROLLBACK_SHA" ] && [ -z "$ROLLBACK_DB" ]; then
  err "Specify --code <sha> and/or --db <backup-file>. Run with --list-backups to see available DB backups."
fi

# ── Code rollback ────────────────────────────────────────────────────────────
if [ -n "$ROLLBACK_SHA" ]; then
  step "Code rollback to $ROLLBACK_SHA"
  log "Creating revert commit on current branch..."
  git revert --no-edit "$ROLLBACK_SHA"
  log "Revert committed. Now re-deploying..."
  "$REPO_ROOT/deploy/sync-prod.sh" --skip-build
  log "Code rollback complete."
fi

# ── DB rollback ──────────────────────────────────────────────────────────────
if [ -n "$ROLLBACK_DB" ]; then
  step "DB rollback from $ROLLBACK_DB"
  log "WARNING: This will DROP all data written after the backup was taken."
  read -r -p "  Type 'yes' to confirm: " CONFIRM
  [ "$CONFIRM" = "yes" ] || err "Aborted."

  # Stop the app first to prevent writes during restore
  log "Stopping eterapy web + worker..."
  ssh "${SSH_OPTS[@]}" "$VPS_HOST" "pm2 stop eterapy eterapy-worker || true"

  log "Restoring backup $ROLLBACK_DB on VPS..."
  ssh "${SSH_OPTS[@]}" "$VPS_HOST" bash -se <<REMOTE
set -euo pipefail
source $DB_CREDS_REMOTE
export DATABASE_URL
DB_URL="\${DATABASE_URL}"
DB_NAME="\${DB_URL##*/}"; DB_NAME="\${DB_NAME%%\?*}"
PGPASS="\$(echo "\$DB_URL" | sed 's|.*://[^:]*:\([^@]*\)@.*|\1|')"
BACKUP="$BACKUP_DIR_REMOTE/$ROLLBACK_DB"
if [ ! -f "\$BACKUP" ]; then
  echo "ERROR: \$BACKUP not found on VPS" >&2; exit 1
fi
echo "▶ Dropping DB \$DB_NAME"
PGPASSWORD="\$PGPASS" psql -h 127.0.0.1 -U eterapy postgres -c "DROP DATABASE IF EXISTS \$DB_NAME WITH (FORCE);"
echo "▶ Creating DB \$DB_NAME"
PGPASSWORD="\$PGPASS" psql -h 127.0.0.1 -U eterapy postgres -c "CREATE DATABASE \$DB_NAME OWNER eterapy;"
echo "▶ Restoring from \$BACKUP"
zcat "\$BACKUP" | PGPASSWORD="\$PGPASS" psql -h 127.0.0.1 -U eterapy "\$DB_NAME"
echo "▶ DB restore complete"
REMOTE

  log "Restarting eterapy web + worker..."
  ssh "${SSH_OPTS[@]}" "$VPS_HOST" "pm2 restart eterapy eterapy-worker || pm2 startOrReload $DEPLOY_DIR_REMOTE/ecosystem.config.js"

  log "DB rollback complete. Verify at https://eterapy.com/api/health"
fi
