#!/usr/bin/env bash
set -Eeuo pipefail

# B473: staging runs as containers (compose project eterapy-staging in
# /opt/eterapy-staging); the A/B flip rewrites DATABASE_URL in the staging
# .env and recreates the web+worker containers instead of a PM2 reload.
PROD_ENV_FILE="${PROD_ENV_FILE:-/opt/eterapy/.env}"
STAGING_DIR="${STAGING_DIR:-/opt/eterapy-staging}"
STAGING_ENV_FILE="${STAGING_ENV_FILE:-$STAGING_DIR/.env}"
STAGING_COMPOSE_FILE="${STAGING_COMPOSE_FILE:-$STAGING_DIR/docker-compose.staging.yml}"
STAGING_HEALTH_URL="${STAGING_HEALTH_URL:-http://127.0.0.1:3201/api/health}"
SYNC_LOCK_FILE="${SYNC_LOCK_FILE:-/tmp/eterapy-staging-db-sync.lock}"
SYNC_FAILPOINT="${SYNC_FAILPOINT:-}"
# INC-055: keep stage-only test-account acceptance results across refreshes.
PRESERVE_STAGE_TEST_RESULTS="${PRESERVE_STAGE_TEST_RESULTS:-1}"
TEST_ACCOUNT_EMAIL_PATTERN="${TEST_ACCOUNT_EMAIL_PATTERN:-%@test.eterapy.com}"
RESTART=false
RUN_MIGRATIONS=false

usage() {
  cat <<'EOF'
Usage: sync-staging-db-from-prod.sh [--restart] [--migrate]

Copies the production PostgreSQL database into an inactive staging A/B database
on the VPS, then flips staging to it by rewriting DATABASE_URL in the staging
.env and recreating the staging containers.
The script never writes to production. It reads DATABASE_URL from:
  /opt/eterapy/.env           (prod, root-only — read via sudo)
  /opt/eterapy-staging/.env   (staging, admin-owned)

Options:
  --restart   Activate the restored DB and recreate the staging containers.
  --migrate   Run prisma migrate deploy against the inactive DB before activation
              (inside the staging release image, one-shot container).

Operational fault injection:
  SYNC_FAILPOINT=after_restore  Abort after restore/migrations, before activation.
                                The inactive DB is cleaned and live staging is untouched.
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

# .env files are dotenv-style KEY=value lines (the prod one is root-only, so
# read through sudo). Last assignment wins; optional surrounding quotes are
# stripped — matching how docker compose itself parses env_file.
load_database_url() {
  local -r env_file="$1"
  sudo test -f "$env_file" || { echo "ERROR: env file not found: $env_file" >&2; return 1; }
  sudo cat "$env_file" | node -e '
    let body = "";
    process.stdin.on("data", (chunk) => { body += chunk; });
    process.stdin.on("end", () => {
      const lines = body.split("\n").filter((line) => /^DATABASE_URL=/.test(line));
      if (lines.length === 0) process.exit(0);
      let value = lines[lines.length - 1].slice("DATABASE_URL=".length).trim();
      if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'\''") && value.endsWith("'\''"))) {
        value = value.slice(1, -1);
      }
      process.stdout.write(value);
    });
  '
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

database_user_from_url() {
  DATABASE_URL_TO_PARSE="$1" node - <<'NODE'
const url = new URL(process.env.DATABASE_URL_TO_PARSE);
const user = decodeURIComponent(url.username);
if (!user) process.exit(2);
process.stdout.write(user);
NODE
}

replace_database_name_in_url() {
  DATABASE_URL_TO_PARSE="$1" DATABASE_NAME="$2" node - <<'NODE'
const url = new URL(process.env.DATABASE_URL_TO_PARSE);
url.pathname = `/${encodeURIComponent(process.env.DATABASE_NAME)}`;
process.stdout.write(url.toString());
NODE
}

validate_identifier() {
  local -r value="$1"
  local -r label="$2"
  [[ "$value" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || {
    echo "ERROR: $label '$value' is not a safe PostgreSQL identifier" >&2
    exit 1
  }
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || { echo "ERROR: command not found: $1" >&2; exit 1; }
}

require_command pg_dump
require_command pg_restore
require_command psql
require_command node
require_command sudo
require_command curl
require_command docker
require_command flock

# Serialize scheduled, manual, and deployment-triggered invocations on the VPS.
# The lock belongs in the script so every caller gets the same protection.
exec 9>"$SYNC_LOCK_FILE"
if ! flock -n 9; then
  log "Another staging DB refresh is already running; exiting without changes"
  exit 0
fi

if [[ -n "$SYNC_FAILPOINT" && "$SYNC_FAILPOINT" != "after_restore" ]]; then
  echo "ERROR: unsupported SYNC_FAILPOINT '$SYNC_FAILPOINT'" >&2
  exit 1
fi

PROD_DATABASE_URL="$(load_database_url "$PROD_ENV_FILE")"
STAGING_DATABASE_URL="$(load_database_url "$STAGING_ENV_FILE")"

[[ -n "$PROD_DATABASE_URL" ]] || { echo "ERROR: production DATABASE_URL is empty" >&2; exit 1; }
[[ -n "$STAGING_DATABASE_URL" ]] || { echo "ERROR: staging DATABASE_URL is empty" >&2; exit 1; }

PROD_DB_NAME="$(db_name_from_url "$PROD_DATABASE_URL")"
STAGING_DB_NAME="$(db_name_from_url "$STAGING_DATABASE_URL")"
STAGING_DB_USER="$(database_user_from_url "$STAGING_DATABASE_URL")"
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

validate_identifier "$STAGING_DB_NAME" "staging database name"
validate_identifier "$STAGING_DB_USER" "staging database owner"

if [[ "$STAGING_DB_NAME" == *_next ]]; then
  STAGING_DB_BASE="${STAGING_DB_NAME%_next}"
  TARGET_DB_NAME="$STAGING_DB_BASE"
else
  STAGING_DB_BASE="$STAGING_DB_NAME"
  TARGET_DB_NAME="${STAGING_DB_BASE}_next"
fi

validate_identifier "$STAGING_DB_BASE" "staging database base name"
validate_identifier "$TARGET_DB_NAME" "inactive staging database name"

if [[ "$TARGET_DB_NAME" == "$PROD_DB_NAME" || "$TARGET_DB_NAME" != *staging* ]]; then
  echo "ERROR: refusing unsafe inactive database target '$TARGET_DB_NAME'" >&2
  exit 1
fi

TARGET_DATABASE_URL="$(replace_database_name_in_url "$STAGING_DATABASE_URL" "$TARGET_DB_NAME")"
TARGET_PG_URL="$(postgres_cli_url_from_prisma_url "$TARGET_DATABASE_URL")"

TMPDIR="$(mktemp -d)"
DUMP_FILE="$TMPDIR/prod.dump"
ENV_BACKUP="$TMPDIR/staging.env.backup"
TARGET_CREATED=false
ACTIVATED=false

drop_database_if_exists() {
  local -r database_name="$1"
  sudo -u postgres psql --dbname=postgres --set=ON_ERROR_STOP=1 \
    --set=target="$database_name" -q <<'SQL'
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = :'target'
  AND pid <> pg_backend_pid();
SELECT format('DROP DATABASE IF EXISTS %I', :'target') \gexec
SQL
}

cleanup() {
  local -r exit_code=$?
  trap - EXIT
  if [[ "$TARGET_CREATED" == "true" && "$ACTIVATED" != "true" ]]; then
    log "Cleaning inactive DB '$TARGET_DB_NAME' after an aborted refresh"
    drop_database_if_exists "$TARGET_DB_NAME" || log "WARNING: inactive DB cleanup failed"
  fi
  rm -rf -- "$TMPDIR"
  exit "$exit_code"
}
trap cleanup EXIT

create_inactive_database() {
  sudo -u postgres psql --dbname=postgres --set=ON_ERROR_STOP=1 \
    --set=target="$TARGET_DB_NAME" --set=owner="$STAGING_DB_USER" -q <<'SQL'
SELECT format('CREATE DATABASE %I OWNER %I TEMPLATE template0', :'target', :'owner') \gexec
SQL
}

# Unquoted dotenv value on purpose: docker compose env_file passes quotes
# through inconsistently across parsers; a URL never needs them.
write_database_url_atomically() {
  local -r env_file="$1"
  local -r database_url="$2"
  ENV_FILE="$env_file" NEW_DATABASE_URL="$database_url" node - <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const envFile = process.env.ENV_FILE;
const current = fs.readFileSync(envFile, "utf8");
if (!/^DATABASE_URL=/m.test(current)) throw new Error("DATABASE_URL line not found");
const next = current.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${process.env.NEW_DATABASE_URL}`);
const stat = fs.statSync(envFile);
const temp = path.join(path.dirname(envFile), `.env.${process.pid}.tmp`);
fs.writeFileSync(temp, next, { mode: stat.mode });
fs.renameSync(temp, envFile);
NODE
}

wait_for_staging_health() {
  local attempt
  for attempt in {1..30}; do
    if curl -fsS --max-time 5 "$STAGING_HEALTH_URL" | node -e '
      let body = "";
      process.stdin.on("data", (chunk) => { body += chunk; });
      process.stdin.on("end", () => {
        const result = JSON.parse(body);
        process.exit(result.status === "ok" && (result.db === "ok" || result.ready?.status === "ok") ? 0 : 1);
      });
    '; then
      return 0
    fi
    sleep 1
  done
  return 1
}

# Recreate web+worker so they re-read the staging .env (env_file is only
# applied at container creation). --no-deps: the one-shot migrate service must
# not rerun here — migrations already ran against the inactive DB.
reload_staging_containers() {
  sudo docker compose -f "$STAGING_COMPOSE_FILE" up -d --force-recreate --no-deps web worker
}

verify_container_database_target() {
  local -r expected_database="$1"
  sudo docker inspect eterapy-staging-web-1 eterapy-staging-worker-1 \
    | EXPECTED_DATABASE="$expected_database" node -e '
    let body = "";
    process.stdin.on("data", (chunk) => { body += chunk; });
    process.stdin.on("end", () => {
      const expected = process.env.EXPECTED_DATABASE;
      const containers = JSON.parse(body);
      const invalid = containers.filter((container) => {
        try {
          const env = Object.fromEntries(
            (container.Config?.Env ?? []).map((entry) => {
              const separator = entry.indexOf("=");
              return [entry.slice(0, separator), entry.slice(separator + 1)];
            }),
          );
          const database = decodeURIComponent(new URL(env.DATABASE_URL ?? "").pathname.slice(1));
          return container.State?.Status !== "running" || database !== expected;
        } catch {
          return true;
        }
      });
      if (containers.length !== 2 || invalid.length > 0) {
        process.stderr.write(
          `Container target verification failed: expected web+worker running on ${expected}\n`,
        );
        process.exit(1);
      }
    });
  '
}

# B720: a single production table created under another role took the whole
# staging sync down for a day. pg_dump acquires LOCK TABLE ... IN ACCESS SHARE
# MODE for every table of the schema in one statement, so one denied table
# aborts the dump entirely. Dump only what the dump role may actually read and
# name whatever is skipped, instead of losing staging over it. The script still
# never writes to production.
unreadable_prod_tables() {
  psql --no-align --tuples-only --dbname="$PROD_PG_URL" --command="
    select quote_ident(schemaname) || '.' || quote_ident(tablename)
    from pg_tables
    where schemaname = 'public'
      and not has_table_privilege(
        current_user,
        format('%I.%I', schemaname, tablename)::regclass,
        'SELECT'
      )
    order by 1
  "
}

DUMP_EXCLUDES=()
while IFS= read -r unreadable_table; do
  [[ -n "$unreadable_table" ]] || continue
  log "WARNING: skipping table $unreadable_table — dump role lacks SELECT on it"
  DUMP_EXCLUDES+=(--exclude-table="$unreadable_table")
done < <(unreadable_prod_tables)

log "Dumping production DB '$PROD_DB_NAME' to a temporary custom-format dump"
pg_dump --format=custom --no-owner --no-acl \
  ${DUMP_EXCLUDES[@]+"${DUMP_EXCLUDES[@]}"} \
  --dbname="$PROD_PG_URL" --file="$DUMP_FILE"

log "Preparing inactive staging DB '$TARGET_DB_NAME' while '$STAGING_DB_NAME' stays live"
drop_database_if_exists "$TARGET_DB_NAME"
create_inactive_database
TARGET_CREATED=true

log "Restoring production dump into inactive DB '$TARGET_DB_NAME'"
pg_restore --exit-on-error --no-owner --no-acl --dbname="$TARGET_PG_URL" "$DUMP_FILE"

if [[ "$RUN_MIGRATIONS" == "true" ]]; then
  log "Running prisma migrate deploy on inactive DB '$TARGET_DB_NAME' (one-shot container)"
  sudo docker compose -f "$STAGING_COMPOSE_FILE" run --rm --no-deps \
    -e DATABASE_URL="$TARGET_DATABASE_URL" migrate
fi

log "Validating restored inactive DB"
psql "$TARGET_PG_URL" -v ON_ERROR_STOP=1 -Atqc \
  "SELECT CASE WHEN to_regclass('public.\"_prisma_migrations\"') IS NOT NULL THEN 1 ELSE 0 END" \
  | grep -qx 1

# INC-055: stage-only acceptance data written by the shared test accounts
# (…@test.eterapy.com) must survive the prod→staging refresh, otherwise a saved
# staging reading and its direct URL disappear at the next hourly sync. After
# the restore (and optional migrations) into the inactive DB, copy the LIVE
# staging DB's product_results rows for test accounts that the prod snapshot
# does not contain. Column list = intersection of both schemas (migrations may
# have added columns to the target); dangling dialogue references are nulled,
# mirroring the Prisma relation's onDelete: SetNull. A failure aborts the
# refresh (live staging keeps the data) rather than silently dropping it.
preserve_stage_test_results() {
  local src_cols tgt_cols cols inserted
  src_cols="$(psql "$STAGING_PG_URL" -Atqc \
    "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='product_results' ORDER BY ordinal_position")"
  tgt_cols="$(psql "$TARGET_PG_URL" -Atqc \
    "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='product_results'")"
  cols="$(SRC_COLS="$src_cols" TGT_COLS="$tgt_cols" node -e '
    const src = process.env.SRC_COLS.split("\n").filter(Boolean);
    const tgt = new Set(process.env.TGT_COLS.split("\n").filter(Boolean));
    const cols = src.filter((column) => tgt.has(column));
    if (!cols.includes("id") || !cols.includes("user_id")) process.exit(2);
    process.stdout.write(cols.map((column) => `"${column}"`).join(", "));
  ')"
  inserted="$(
    psql "$STAGING_PG_URL" -v ON_ERROR_STOP=1 -Atqc \
      "COPY (SELECT ${cols} FROM public.product_results WHERE user_id IN (SELECT id FROM public.users WHERE email LIKE '${TEST_ACCOUNT_EMAIL_PATTERN}')) TO STDOUT" \
      | psql "$TARGET_PG_URL" -v ON_ERROR_STOP=1 -Atq \
          -c "CREATE TEMP TABLE _inc055_preserve (LIKE public.product_results INCLUDING DEFAULTS)" \
          -c "COPY _inc055_preserve (${cols}) FROM STDIN" \
          -c "UPDATE _inc055_preserve p SET dialogue_id = NULL WHERE p.dialogue_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.dialogues d WHERE d.id = p.dialogue_id)" \
          -c "WITH ins AS (INSERT INTO public.product_results (${cols}) SELECT ${cols} FROM _inc055_preserve p WHERE EXISTS (SELECT 1 FROM public.users u WHERE u.id = p.user_id) AND NOT EXISTS (SELECT 1 FROM public.product_results t WHERE t.id = p.id) RETURNING 1) SELECT count(*) FROM ins" \
      | tail -n 1
  )"
  log "Preserved $inserted stage-only test-account product_results row(s)"
}

if [[ "$PRESERVE_STAGE_TEST_RESULTS" == "1" ]]; then
  log "Preserving stage-only test-account results from '$STAGING_DB_NAME'"
  preserve_stage_test_results
fi

if [[ "$SYNC_FAILPOINT" == "after_restore" ]]; then
  log "Fault injection after_restore: aborting before DATABASE_URL activation"
  exit 97
fi

if [[ "$RESTART" == "true" ]]; then
  cp -p -- "$STAGING_ENV_FILE" "$ENV_BACKUP"
  log "Activating '$TARGET_DB_NAME' with an atomic env-file replacement"
  write_database_url_atomically "$STAGING_ENV_FILE" "$TARGET_DATABASE_URL"

  log "Recreating staging containers on the new database"
  if ! reload_staging_containers; then
    log "Activation recreate failed; restoring previous DATABASE_URL"
    cp -p -- "$ENV_BACKUP" "$STAGING_ENV_FILE"
    reload_staging_containers || true
    exit 1
  fi

  if ! verify_container_database_target "$TARGET_DB_NAME"; then
    log "Containers retained the wrong database target; restoring '$STAGING_DB_NAME'"
    cp -p -- "$ENV_BACKUP" "$STAGING_ENV_FILE"
    reload_staging_containers || true
    verify_container_database_target "$STAGING_DB_NAME" || true
    exit 1
  fi

  if ! wait_for_staging_health; then
    log "Health verification failed; rolling back to '$STAGING_DB_NAME'"
    cp -p -- "$ENV_BACKUP" "$STAGING_ENV_FILE"
    reload_staging_containers || true
    verify_container_database_target "$STAGING_DB_NAME" || true
    wait_for_staging_health || log "WARNING: staging health did not recover after rollback"
    exit 1
  fi

  ACTIVATED=true
  log "A/B refresh complete: '$TARGET_DB_NAME' is live; '$STAGING_DB_NAME' is the rollback generation"
else
  log "Inactive restore validated; --restart was not supplied, so live staging remains unchanged"
fi
