#!/usr/bin/env bash
# Shared Telegram notifier for every pipeline (CI, staging, production fleet).
#
# Why one script: the prod pipeline was rewritten for the container fleet
# (B473) and its notification lost the per-stage detail the staging one had,
# while CI had no notification at all — so GitHub mailed "run failed" while
# Telegram only ever showed the green deploy. Every workflow now renders the
# same block through here.
#
# Input (env):
#   TG_TOKEN, TG_CHAT   Telegram credentials. Missing → no-op, exit 0.
#   TITLE               Pipeline name, e.g. "PRODUCTION deploy".
#   STAGES              Newline list "label=result" (result = GitHub job
#                       result: success/failure/cancelled/skipped). Drives both
#                       the icon strip and the headline verdict.
#   FIELDS              Newline list "Label=value" rendered as a field block.
#   NODES               Optional newline list "label=result" for fleet hosts.
#   RUN_URL             Link to the workflow run.
#   EXTRA_LINKS         Optional newline list "text=url".
#   DRY_RUN             "1" prints the payload instead of sending it.
set -uo pipefail

if [ "${DRY_RUN:-}" != "1" ] && { [ -z "${TG_TOKEN:-}" ] || [ -z "${TG_CHAT:-}" ]; }; then
  echo "Telegram not configured — skipping notification."
  exit 0
fi

icon() {
  case "$1" in
    success) printf '✅' ;;
    failure) printf '❌' ;;
    cancelled) printf '⚠️' ;;
    skipped) printf '⏭' ;;
    *) printf '❔' ;;
  esac
}

esc() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }

# Callers pass block scalars straight out of YAML, so every line carries the
# workflow's indentation. Strip it rather than making each caller unindent.
trim() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

# ── Verdict: name the first stage that actually failed, so the headline says
# WHERE it broke instead of a generic "pipeline failed".
FAILED_STAGE=""
CANCELLED=0
ALL_SKIPPED=1
STATUS_LINE=""
while IFS= read -r entry; do
  entry="$(trim "$entry")"
  [ -z "$entry" ] && continue
  label="$(trim "${entry%%=*}")"
  result="$(trim "${entry#*=}")"
  [ -n "$STATUS_LINE" ] && STATUS_LINE="$STATUS_LINE · "
  STATUS_LINE="$STATUS_LINE$(icon "$result") $(esc "$label")"
  case "$result" in
    failure) [ -z "$FAILED_STAGE" ] && FAILED_STAGE="$label"; ALL_SKIPPED=0 ;;
    cancelled) CANCELLED=1; ALL_SKIPPED=0 ;;
    skipped) ;;
    *) ALL_SKIPPED=0 ;;
  esac
done <<< "${STAGES:-}"

if [ -n "$FAILED_STAGE" ]; then
  HEADER="❌ <b>$(esc "$TITLE") FAILED at $(esc "$FAILED_STAGE")</b>"
elif [ "$CANCELLED" = "1" ]; then
  HEADER="⚠️ <b>$(esc "$TITLE") CANCELLED</b>"
elif [ "$ALL_SKIPPED" = "1" ]; then
  HEADER="⏭ <b>$(esc "$TITLE") skipped</b>"
else
  HEADER="✅ <b>$(esc "$TITLE") SUCCESS</b>"
fi

TEXT="$HEADER"
[ -n "$STATUS_LINE" ] && TEXT="$TEXT"$'\n\n'"$STATUS_LINE"

# ── Field block ────────────────────────────────────────────────────────────
FIELD_BLOCK=""
while IFS= read -r entry; do
  entry="$(trim "$entry")"
  [ -z "$entry" ] && continue
  label="$(trim "${entry%%=*}")"
  value="$(trim "${entry#*=}")"
  [ -z "$value" ] && continue
  # Commit hashes read better as inline code.
  case "$label" in
    Commit|Image) rendered="<code>$(esc "$value")</code>" ;;
    *) rendered="$(esc "$value")" ;;
  esac
  FIELD_BLOCK="$FIELD_BLOCK"$'\n'"<b>$(esc "$label"):</b> $rendered"
done <<< "${FIELDS:-}"
[ -n "$FIELD_BLOCK" ] && TEXT="$TEXT"$'\n'"$FIELD_BLOCK"

# ── Per-node block (fleet deploys) ─────────────────────────────────────────
NODE_BLOCK=""
while IFS= read -r entry; do
  entry="$(trim "$entry")"
  [ -z "$entry" ] && continue
  label="$(trim "${entry%%=*}")"
  result="$(trim "${entry#*=}")"
  NODE_BLOCK="$NODE_BLOCK"$'\n'"$(icon "$result") $(esc "$label")"
done <<< "${NODES:-}"
[ -n "$NODE_BLOCK" ] && TEXT="$TEXT"$'\n\n'"<b>Nodes:</b>$NODE_BLOCK"

# ── Links ──────────────────────────────────────────────────────────────────
LINK_LINE=""
if [ -n "${RUN_URL:-}" ]; then
  LINK_LINE="<a href=\"$(esc "$RUN_URL")\">View run</a>"
fi
while IFS= read -r entry; do
  entry="$(trim "$entry")"
  [ -z "$entry" ] && continue
  text="$(trim "${entry%%=*}")"
  url="$(trim "${entry#*=}")"
  [ -z "$url" ] && continue
  [ -n "$LINK_LINE" ] && LINK_LINE="$LINK_LINE · "
  LINK_LINE="$LINK_LINE<a href=\"$(esc "$url")\">$(esc "$text")</a>"
done <<< "${EXTRA_LINKS:-}"
[ -n "$LINK_LINE" ] && TEXT="$TEXT"$'\n\n'"$LINK_LINE"

if [ "${DRY_RUN:-}" = "1" ]; then
  printf '%s\n' "$TEXT"
  exit 0
fi

curl -fsS -X POST "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
  --data-urlencode "chat_id=${TG_CHAT}" \
  --data-urlencode "text=${TEXT}" \
  -d "parse_mode=HTML" \
  -d "disable_web_page_preview=true" \
  >/dev/null || echo "::warning::Telegram notification failed"
