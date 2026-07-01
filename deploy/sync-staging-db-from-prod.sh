#!/usr/bin/env bash
set -Eeuo pipefail

PROD_WEB_DIR="${PROD_WEB_DIR:-/home/admin/eterapy/web}"
STAGING_WEB_DIR="${STAGING_WEB_DIR:-/home/admin/eterapy-staging/web}"
STAGING_ECOSYSTEM="${STAGING_ECOSYSTEM:-/home/admin/eterapy-staging/deploy/ecosystem.staging.config.js}"
RESTART=false
RUN_MIGRATIONS=false

usage() {
  cat <<'EOF'
Usage: sync-staging-db-from-prod.sh [--restart] [--migrate]

Copies the production PostgreSQL database into the staging database on the VPS.
The script never writes to production. It reads DATABASE_URL from:
  /home/admin/eterapy/web/.env.local
  /home/admin/eterapy-staging/web/.env.local

Options:
  --restart   Restart staging PM2 processes after restore.
  --migrate   Run prisma migrate deploy against staging after restore.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --restart)
      RESTART=true
      shift
      ;;
    --migrate)
      RUN_MIGRATIONS=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

log() {
  printf '[%s] %s\n' "$(date +'%Y-%m-%d %H:%M:%S')" "$*" >&2
}

load_database_url() {
  local -r env_file="$1"
  [[ -f "$env_file" ]] || { echo "ERROR: env file not found: $env_file" >&2; return 1; }
  (
    set -a
    # shellcheck disable=SC1090
    . "$env_file"
    set +a
    printf '%s' "${DATABASE_URL:-}"
  )
}

db_name_from_url() {
  DATABASE_URL_TO_PARSE="$1" node - <<'NODE'
const url = new URL(process.env.DATABASE_URL_TO_PARSE);
const name = decodeURIComponent(url.pathname.replace(/^\//, ""));
if (!name) process.exit(2);
process.stdout.write(name);
NODE
}

postgres_cli_url_from_prisma_url() {
  DATABASE_URL_TO_PARSE="$1" node - <<'NODE'
const url = new URL(process.env.DATABASE_URL_TO_PARSE);
url.searchParams.delete("schema");
process.stdout.write(url.toString());
NODE
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || { echo "ERROR: command not found: $1" >&2; exit 1; }
}

require_command pg_dump
require_command pg_restore
require_command psql
require_command node

PROD_DATABASE_URL="$(load_database_url "$PROD_WEB_DIR/.env.local")"
STAGING_DATABASE_URL="$(load_database_url "$STAGING_WEB_DIR/.env.local")"

[[ -n "$PROD_DATABASE_URL" ]] || { echo "ERROR: production DATABASE_URL is empty" >&2; exit 1; }
[[ -n "$STAGING_DATABASE_URL" ]] || { echo "ERROR: staging DATABASE_URL is empty" >&2; exit 1; }

PROD_DB_NAME="$(db_name_from_url "$PROD_DATABASE_URL")"
STAGING_DB_NAME="$(db_name_from_url "$STAGING_DATABASE_URL")"
PROD_PG_URL="$(postgres_cli_url_from_prisma_url "$PROD_DATABASE_URL")"
STAGING_PG_URL="$(postgres_cli_url_from_prisma_url "$STAGING_DATABASE_URL")"

if [[ "$PROD_DB_NAME" == "$STAGING_DB_NAME" ]]; then
  echo "ERROR: refusing to sync because production and staging DB names are identical" >&2
  exit 1
fi

if [[ "$STAGING_DB_NAME" != *staging* ]]; then
  echo "ERROR: refusing to restore into DB '$STAGING_DB_NAME' because it does not look like staging" >&2
  exit 1
fi

TMPDIR="$(mktemp -d)"
trap 'rm -rf -- "$TMPDIR"' EXIT
DUMP_FILE="$TMPDIR/prod.dump"

log "Dumping production DB '$PROD_DB_NAME' to a temporary custom-format dump"
pg_dump --format=custom --no-owner --no-acl --dbname="$PROD_PG_URL" --file="$DUMP_FILE"

log "Stopping staging PM2 processes before destructive restore"
pm2 stop eterapy-staging eterapy-staging-worker >/dev/null 2>&1 || true

log "Terminating active staging DB sessions"
psql "$STAGING_PG_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = current_database()
  AND pid <> pg_backend_pid();
SQL

log "Resetting public schema in staging DB '$STAGING_DB_NAME'"
psql "$STAGING_PG_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO public;
SQL

log "Restoring production dump into staging"
pg_restore --no-owner --no-acl --dbname="$STAGING_PG_URL" "$DUMP_FILE"

if [[ "$RUN_MIGRATIONS" == "true" ]]; then
  log "Running prisma migrate deploy on staging"
  (
    cd "$STAGING_WEB_DIR"
    set -a
    # shellcheck disable=SC1090
    . ./.env.local
    set +a
    npx prisma migrate deploy
  )
fi

if [[ "$RESTART" == "true" ]]; then
  log "Restarting staging PM2 processes"
  pm2 startOrReload "$STAGING_ECOSYSTEM" --update-env
  pm2 save --force >/dev/null
else
  log "Restore complete; staging restart is left to the caller"
fi
