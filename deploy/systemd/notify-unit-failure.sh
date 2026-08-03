#!/usr/bin/env bash
# INC-098 — что уходит в Telegram, когда systemd-юнит упал.
#
# Задача сообщения: чтобы владельцу не пришлось заходить на ноду за причиной.
# Поэтому в нём не «юнит X failed», а имя ноды, код выхода и последние строки
# журнала — то, с чего начинается любой разбор.
#
# Адрес — служебный (деплой-)канал: это уведомление о состоянии инфраструктуры,
# а не маркетинговое. Маркетинговый канал под SEO/SMM живёт отдельно (B640).
#
# Идём через `TELEGRAM_API_BASE` (релей): api.telegram.org с РФ-ноды
# недоступен, и прямой вызов здесь повторил бы ровно ту ошибку, о которой этот
# юнит и должен сообщать.
set -u

UNIT="${1:?unit name required}"
ENV_FILE="${ENV_FILE:-/opt/eterapy/.env}"

from_env_file() {
  [ -r "$ENV_FILE" ] || return 0
  sed -n "s/^$1=//p" "$ENV_FILE" | head -1
}

API_BASE="$(from_env_file TELEGRAM_API_BASE)"
CHAT="$(from_env_file TELEGRAM_CHAT_ID)"
NODE="$(from_env_file FLEET_NODE_NAME)"
[ -n "$NODE" ] || NODE="$(hostname)"

if [ -z "$API_BASE" ] || [ -z "$CHAT" ]; then
  echo "notify-unit-failure: TELEGRAM_API_BASE или TELEGRAM_CHAT_ID не задан — сообщить некуда" >&2
  exit 0
fi

RESULT="$(systemctl show -p Result --value "$UNIT" 2>/dev/null || echo unknown)"
STATUS="$(systemctl show -p ExecMainStatus --value "$UNIT" 2>/dev/null || echo '?')"
LOG="$(journalctl -u "$UNIT" -n 12 --no-pager -o cat 2>/dev/null | tail -c 1500)"

TEXT="$(printf '⚠️ Юнит упал: %s\nНода: %s\nРезультат: %s (код %s)\n\nЖурнал:\n%s' \
  "$UNIT" "$NODE" "$RESULT" "$STATUS" "${LOG:-(журнал пуст)}")"

curl -sS -m 30 -X POST "${API_BASE}/sendMessage" \
  --data-urlencode "chat_id=${CHAT}" \
  --data-urlencode "text=${TEXT}" \
  -d disable_web_page_preview=true >/dev/null \
  || echo "notify-unit-failure: сообщение не ушло" >&2
exit 0
