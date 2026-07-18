#!/usr/bin/env bash
# B536 — off-host encrypted database backup for the eterapy fleet.
#
# pg_dump (custom format) → gpg symmetric encryption → rclone copy to one or
# more S3 remotes → local + remote rotation → Telegram alert on any failure.
#
# 152-ФЗ: RU production dumps contain РФ personal data and must land ONLY in
# RU object storage (cloud.ru). Never point RU_REMOTES at AWS. The Foreign
# contour (B540) gets its own AWS destination with non-RU data.
#
# Config is read from /opt/eterapy/backup.env (see backup.env.example). All
# secrets stay in that file (chmod 600); nothing is passed on the command line.
set -euo pipefail

CONFIG="${BACKUP_ENV:-/opt/eterapy/backup.env}"
# shellcheck disable=SC1090
[ -f "$CONFIG" ] && . "$CONFIG"

: "${PGDATABASE:?set PGDATABASE in $CONFIG}"
: "${BACKUP_PASSPHRASE:?set BACKUP_PASSPHRASE in $CONFIG}"
: "${BACKUP_REMOTES:?set BACKUP_REMOTES (space-separated rclone remotes) in $CONFIG}"
LOCAL_DIR="${BACKUP_LOCAL_DIR:-/opt/eterapy/backups}"
KEEP="${BACKUP_KEEP:-14}"
LABEL="${BACKUP_LABEL:-eterapy-1}"
PGUSER_EFF="${PGUSER:-postgres}"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
BASENAME="${LABEL}-${PGDATABASE}-${TS}.dump.gpg"
mkdir -p "$LOCAL_DIR"
LOCAL_PATH="$LOCAL_DIR/$BASENAME"

log() { echo "[$(date -u +%H:%M:%S)] $*"; }

alert() {
  # $1 = status word, $2 = detail. Best-effort; never fails the backup itself.
  [ -n "${TG_TOKEN:-}" ] && [ -n "${TG_CHAT:-}" ] || return 0
  local icon head
  if [ "$1" = "ok" ]; then icon="💾"; head="Backup OK"; else icon="🛑"; head="BACKUP FAILED"; fi
  local text
  text=$(printf '%s <b>%s</b> — %s\n<b>Object:</b> <code>%s</code>\n<b>Detail:</b> %s' \
    "$icon" "$head" "$LABEL" "$BASENAME" "$2")
  curl -fsS -X POST "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TG_CHAT}" \
    --data-urlencode "text=${text}" \
    -d parse_mode=HTML -d disable_web_page_preview=true >/dev/null 2>&1 || true
}

fail() { log "ERROR: $1"; alert fail "$1"; exit 1; }

# ── 1. Dump + encrypt in one pipeline (plaintext never touches disk) ────────
# pg_dump runs as the postgres superuser via sudo so peer auth works on the
# system cluster; on the container fleet PGUSER/PGPASSWORD env is honoured.
log "dumping $PGDATABASE → encrypted $BASENAME"
if [ "${USE_SUDO_POSTGRES:-1}" = "1" ]; then
  DUMP_CMD=(sudo -u "$PGUSER_EFF" pg_dump -Fc "$PGDATABASE")
else
  DUMP_CMD=(pg_dump -Fc "$PGDATABASE")
fi

set -o pipefail
if ! "${DUMP_CMD[@]}" \
  | gpg --batch --yes --symmetric --cipher-algo AES256 \
        --passphrase "$BACKUP_PASSPHRASE" -o "$LOCAL_PATH"; then
  fail "pg_dump|gpg pipeline failed"
fi

SIZE=$(stat -c %s "$LOCAL_PATH" 2>/dev/null || echo 0)
[ "$SIZE" -gt 0 ] || fail "encrypted dump is empty"
log "encrypted dump ready ($SIZE bytes)"

# ── 2. Ship to every remote (two independent RU copies) ─────────────────────
SHIPPED=0
for remote in $BACKUP_REMOTES; do
  if rclone copyto --s3-no-check-bucket "$LOCAL_PATH" "$remote/$BASENAME" 2>&1; then
    log "shipped → $remote"
    SHIPPED=$((SHIPPED + 1))
    # Remote rotation: keep the newest $KEEP objects for this label.
    rclone lsf "$remote" 2>/dev/null \
      | grep -E "^${LABEL}-.*\.dump\.gpg$" | sort | head -n -"$KEEP" \
      | while read -r old; do rclone deletefile "$remote/$old" 2>/dev/null || true; done
  else
    log "WARN: failed to ship to $remote"
  fi
done
[ "$SHIPPED" -gt 0 ] || fail "no remote accepted the backup ($BACKUP_REMOTES)"

# ── 3. Local rotation ───────────────────────────────────────────────────────
ls -1t "$LOCAL_DIR/${LABEL}-"*.dump.gpg 2>/dev/null | tail -n +"$((KEEP + 1))" \
  | xargs -r rm -f

log "done: $BASENAME shipped to $SHIPPED/$(echo "$BACKUP_REMOTES" | wc -w) remotes"
alert ok "$SIZE bytes → $SHIPPED remote(s)"
