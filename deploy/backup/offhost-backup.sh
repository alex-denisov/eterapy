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

STARTED_AT=$(date +%s)

# ── Telegram rendering ──────────────────────────────────────────────────────
# Same visual language as .github/scripts/telegram-notify.sh (B553): a verdict
# header that names WHERE it broke, an icon strip of the stages, then a field
# block — one fact per line. That script can't be reused verbatim here: it
# posts to api.telegram.org directly, while RU nodes are geo-blocked and must
# go through the relay.

# Ordered stage ledger. Deliberately NOT an associative array: `declare -A`
# needs bash 4+, and this has to stay runnable wherever the script is dropped
# (macOS ships bash 3.2), so it can be dry-rendered before it ever reaches a node.
STAGE_NAMES="дамп шифрование выгрузка ротация"
STAGES_DONE=""
stage() { STAGES_DONE="$STAGES_DONE $1:$2"; }
stage_result() {
  local entry
  for entry in $STAGES_DONE; do
    [ "${entry%%:*}" = "$1" ] && { printf '%s' "${entry#*:}"; return; }
  done
  printf 'skipped'
}

icon() {
  case "$1" in
    success) printf '✅' ;;
    failure) printf '❌' ;;
    *) printf '⏭' ;;
  esac
}

esc() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }

human_size() {
  # awk, not numfmt: numfmt is GNU coreutils and absent on some hosts, where it
  # silently degraded the alert to raw bytes.
  local b="${1:-0}"
  if [ "$b" -ge 1073741824 ]; then awk -v b="$b" 'BEGIN { printf "%.2f GB", b / 1073741824 }'
  elif [ "$b" -ge 1048576 ]; then awk -v b="$b" 'BEGIN { printf "%.1f MB", b / 1048576 }'
  elif [ "$b" -ge 1024 ]; then awk -v b="$b" 'BEGIN { printf "%.1f KB", b / 1024 }'
  else printf '%s B' "$b"; fi
}

human_duration() {
  local s="${1:-0}"
  if [ "$s" -ge 60 ]; then printf '%d мин %d с' "$((s / 60))" "$((s % 60))"; else printf '%d с' "$s"; fi
}

alert() {
  # $1 = "ok" | name of the stage that failed, $2 = detail, $3 = download URL.
  # Best-effort: an alert failure must never fail the backup itself.
  # RU nodes cannot reach api.telegram.org (geo-blocked) — set TG_API_BASE to
  # the Cloudflare Worker relay (same one the app uses, form
  # https://<worker>.workers.dev/bot<TOKEN>). Falls back to the direct API.
  [ -n "${TG_CHAT:-}" ] || return 0
  local base="${TG_API_BASE:-}"
  [ -n "$base" ] || { [ -n "${TG_TOKEN:-}" ] && base="https://api.telegram.org/bot${TG_TOKEN}"; }
  [ -n "$base" ] || return 0

  local header strip="" name text total size_h
  total=$(echo "$BACKUP_REMOTES" | wc -w | tr -d ' ')
  if [ "$1" = "ok" ]; then
    header="✅ <b>БЭКАП УСПЕШНО</b> — $(esc "$LABEL")"
  else
    header="❌ <b>БЭКАП УПАЛ: $(esc "$1")</b> — $(esc "$LABEL")"
  fi

  for name in $STAGE_NAMES; do
    [ -n "$strip" ] && strip="$strip · "
    strip="$strip$(icon "$(stage_result "$name")") $name"
  done

  text="$header"$'\n\n'"$strip"$'\n'
  text="$text"$'\n'"<b>База:</b> $(esc "$PGDATABASE")"
  text="$text"$'\n'"<b>Файл:</b> <code>$(esc "$BASENAME")</code>"
  if [ "${SIZE:-0}" -gt 0 ]; then
    size_h=$(human_size "$SIZE")
    text="$text"$'\n'"<b>Размер:</b> $size_h"
  fi
  text="$text"$'\n'"<b>Копии:</b> ${SHIPPED:-0}/$total"
  text="$text"$'\n'"<b>Длительность:</b> $(human_duration "$(( $(date +%s) - STARTED_AT ))")"
  text="$text"$'\n'"<b>Хранится копий:</b> $KEEP"
  [ -n "${2:-}" ] && text="$text"$'\n'"<b>Причина:</b> $(esc "$2")"
  [ -n "${3:-}" ] && text="$text"$'\n\n'"<a href=\"$3\">⬇️ Скачать бэкап (ссылка на 72 ч)</a>"

  # Retry: the relay and RU egress both blip. A dropped failure alert is the
  # one we can least afford to lose.
  local attempt
  for attempt in 1 2 3; do
    if curl -fsS -m 20 -X POST "${base}/sendMessage" \
      --data-urlencode "chat_id=${TG_CHAT}" \
      --data-urlencode "text=${text}" \
      -d parse_mode=HTML -d disable_web_page_preview=true >/dev/null 2>&1; then
      return 0
    fi
    [ "$attempt" -lt 3 ] && sleep $((attempt * 3))
  done
  log "WARN: Telegram alert failed after 3 attempts"
}

# $1 = stage that failed, $2 = reason.
fail() { log "ERROR: $2"; stage "$1" failure; alert "$1" "$2"; exit 1; }

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
  # The dump and the encryption share one pipeline, so the failing half can't
  # be told apart — attribute it to the dump and say so in the reason line.
  fail "дамп" "pg_dump|gpg pipeline failed"
fi
stage дамп success

SIZE=$(stat -c %s "$LOCAL_PATH" 2>/dev/null || echo 0)
[ "$SIZE" -gt 0 ] || fail "шифрование" "encrypted dump is empty"
stage шифрование success
log "encrypted dump ready ($SIZE bytes)"

# ── 2. Ship to every remote (two independent RU copies) ─────────────────────
SHIPPED=0
DOWNLOAD_URL=""
for remote in $BACKUP_REMOTES; do
  if rclone copyto --s3-no-check-bucket "$LOCAL_PATH" "$remote/$BASENAME" 2>&1; then
    log "shipped → $remote"
    SHIPPED=$((SHIPPED + 1))
    # Первая удачная копия даёт pre-signed URL для TG-алерта (best-effort).
    if [ -z "$DOWNLOAD_URL" ]; then
      DOWNLOAD_URL=$(rclone link --expire 72h "$remote/$BASENAME" 2>/dev/null || true)
    fi
    # Remote rotation: keep the newest $KEEP objects for this label.
    rclone lsf "$remote" 2>/dev/null \
      | grep -E "^${LABEL}-.*\.dump\.gpg$" | sort | head -n -"$KEEP" \
      | while read -r old; do rclone deletefile "$remote/$old" 2>/dev/null || true; done
  else
    log "WARN: failed to ship to $remote"
  fi
done
[ "$SHIPPED" -gt 0 ] || fail "выгрузка" "no remote accepted the backup ($BACKUP_REMOTES)"
stage выгрузка success

# ── 3. Local rotation ───────────────────────────────────────────────────────
ls -1t "$LOCAL_DIR/${LABEL}-"*.dump.gpg 2>/dev/null | tail -n +"$((KEEP + 1))" \
  | xargs -r rm -f
stage ротация success

log "done: $BASENAME shipped to $SHIPPED/$(echo "$BACKUP_REMOTES" | wc -w) remotes"
alert ok "" "$DOWNLOAD_URL"
