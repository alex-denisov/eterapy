#!/usr/bin/env bash
# B572 — вебхук стейджевого бота @eterapy_staging_bot: поднять / снять / показать.
#
# Правило владельца (2026-07-22): вебхук стейджа поднимается ТОЛЬКО на время
# проверки мини-аппа на стейдже и снимается СРАЗУ после выкатки мини-аппа на
# прод. Иначе живой бот продолжает принимать апдейты в стенд — а стенд ходит в
# копию боевой базы (так уже вышло в INC/B566).
#
# Почему скриптом, а не «не забыть»: шаг, который надо помнить руками, рано или
# поздно не выполняется. Здесь одна команда, и она же печатает текущее
# состояние, так что проверка не требует отдельного знания.
#
#   deploy/staging-bot-webhook.sh up       # поднять (перед проверкой на стейдже)
#   deploy/staging-bot-webhook.sh down     # снять (после выкатки на прод)
#   deploy/staging-bot-webhook.sh status   # что сейчас
#
# Токен с хоста не уезжает: curl выполняется на ноде, здесь только SSH.
# api.telegram.org из РФ-датацентра недоступен, поэтому запросы идут через
# Cloudflare-воркер — его адрес уже лежит в TELEGRAM_API_BASE стенда.
set -euo pipefail

ACTION="${1:-status}"
SSH_KEY="${ETERAPY_SSH_KEY:-$(dirname "$0")/eTerapy_web}"
HOST="${ETERAPY_STAGING_HOST:-admin@192.144.14.146}"
ENV_FILE="/opt/eterapy-staging/.env"

case "$ACTION" in
  up|down|status) ;;
  *) echo "Использование: $0 [up|down|status]" >&2; exit 2 ;;
esac

# Скрипт уходит в bash на той стороне через stdin: логин-шелл ноды — dash,
# и `set -o pipefail` в нём падает с «Illegal option».
remote() {
  printf '%s\n' "$1" | ssh -o ConnectTimeout=10 -i "$SSH_KEY" -o IdentitiesOnly=yes "$HOST" "bash -s"
}

# shellcheck disable=SC2016 — переменные раскрываются на той стороне, не здесь.
read -r -d '' SCRIPT <<REMOTE || true
set -euo pipefail
val() { sudo sed -n "s/^\$1=//p" "$ENV_FILE" | head -1; }
API=\$(val TELEGRAM_API_BASE)
URL=\$(val TELEGRAM_WEBHOOK_URL)
SECRET=\$(val TELEGRAM_WEBHOOK_SECRET)
[ -n "\$API" ] || { echo "TELEGRAM_API_BASE не задан в $ENV_FILE" >&2; exit 1; }

case "$ACTION" in
  up)
    [ -n "\$URL" ] || { echo "TELEGRAM_WEBHOOK_URL не задан в $ENV_FILE" >&2; exit 1; }
    curl -fsS -X POST "\$API/setWebhook" \
      --data-urlencode "url=\$URL" \
      --data-urlencode "secret_token=\$SECRET" \
      -d 'drop_pending_updates=true'
    echo
    ;;
  down)
    # drop_pending_updates: накопленные за время стенда апдейты не должны
    # прилететь при следующем подъёме.
    curl -fsS -X POST "\$API/deleteWebhook" -d 'drop_pending_updates=true'
    echo
    ;;
esac

echo "— текущее состояние —"
curl -fsS "\$API/getWebhookInfo" | python3 -c 'import json,sys; r=json.load(sys.stdin).get("result",{}); print("url:", r.get("url") or "(снят)"); print("pending:", r.get("pending_update_count", 0)); print("last_error:", r.get("last_error_message") or "—")'

# Второй затвор стенда (B566): даже с поднятым вебхуком вход в мини-апп
# открыт только Telegram-аккаунтам из списка, а пустой список закрывает его
# ВСЕМ — включая владельца. Печатаем это здесь, чтобы «вебхук поднял, а войти
# не могу» не выяснялось методом тыка.
ALLOW=\$(val MINIAPP_TELEGRAM_ALLOWLIST)
if [ -n "\$ALLOW" ]; then
  echo "allowlist: \$ALLOW"
else
  echo "allowlist: (пусто) → вход в мини-апп стенда закрыт для всех"
  echo "  открыть: секрет MINIAPP_TELEGRAM_ALLOWLIST = ваш @username, затем выкатка develop"
fi
REMOTE

remote "$SCRIPT"
