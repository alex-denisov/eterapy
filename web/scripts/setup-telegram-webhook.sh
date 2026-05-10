#!/bin/bash
# Регистрация Telegram webhook после деплоя
# Запускать: bash scripts/setup-telegram-webhook.sh

BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
APP_URL="${NEXT_PUBLIC_APP_URL:-https://eterapy.com}"
SECRET="${TELEGRAM_WEBHOOK_SECRET:-}"

if [ -z "$BOT_TOKEN" ]; then
  echo "❌ TELEGRAM_BOT_TOKEN не задан"
  exit 1
fi

WEBHOOK_URL="${TELEGRAM_WEBHOOK_URL:-${APP_URL}/api/telegram/webhook}"

echo "Регистрируем webhook: $WEBHOOK_URL"

curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\": \"${WEBHOOK_URL}\",
    \"secret_token\": \"${SECRET}\",
    \"allowed_updates\": [\"message\"]
  }" | python3 -c "import sys,json; d=json.load(sys.stdin); print('✅ OK' if d.get('ok') else f'❌ {d}')"

echo ""
echo "Проверка webhook:"
curl -s "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo" | python3 -c "
import sys, json
d = json.load(sys.stdin)
r = d.get('result', {})
print(f'  URL: {r.get(\"url\", \"—\")}')
print(f'  Pending: {r.get(\"pending_update_count\", 0)}')
print(f'  Error: {r.get(\"last_error_message\", \"none\")}')
"
