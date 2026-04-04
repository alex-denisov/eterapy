#!/bin/bash
# Локальное тестирование Telegram webhook через cloudflared (бесплатный туннель)
#
# Установка: brew install cloudflared
# Или: curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64 -o cloudflared && chmod +x cloudflared
#
# Запуск:
#   1. В терминале 1: cd web && npm run dev
#   2. В терминале 2: bash scripts/dev-telegram-tunnel.sh
#   3. Скопировать URL туннеля и зарегистрировать webhook

set -e

BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
SECRET="${TELEGRAM_WEBHOOK_SECRET:-eterapy_wh_secret_2026}"
PORT="${PORT:-3000}"

if [ -z "$BOT_TOKEN" ]; then
  # Попробуем прочитать из .env.local
  BOT_TOKEN=$(grep "TELEGRAM_BOT_TOKEN=" .env.local 2>/dev/null | cut -d= -f2)
fi

if [ -z "$BOT_TOKEN" ]; then
  echo "❌ TELEGRAM_BOT_TOKEN не задан. Добавьте в .env.local"
  exit 1
fi

echo "🚀 Запускаем cloudflared туннель на порт $PORT..."
echo ""

# Запускаем cloudflared в фоне, читаем URL из вывода
TMPFILE=$(mktemp)
cloudflared tunnel --url "http://localhost:$PORT" 2>&1 | tee "$TMPFILE" &
CLOUDFLARED_PID=$!

# Ждём URL
sleep 4
TUNNEL_URL=$(grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' "$TMPFILE" | head -1)

if [ -z "$TUNNEL_URL" ]; then
  echo "❌ Не удалось получить URL туннеля. Проверьте что cloudflared установлен."
  kill $CLOUDFLARED_PID 2>/dev/null
  exit 1
fi

WEBHOOK_URL="${TUNNEL_URL}/api/telegram/webhook"
echo "✅ Туннель активен: $TUNNEL_URL"
echo ""
echo "📎 Webhook URL: $WEBHOOK_URL"
echo ""

# Регистрируем webhook
echo "⚙️  Регистрируем webhook в Telegram..."
RESULT=$(curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\": \"${WEBHOOK_URL}\",
    \"secret_token\": \"${SECRET}\",
    \"allowed_updates\": [\"message\"]
  }")

echo "Ответ Telegram: $RESULT"
echo ""

# Проверяем
INFO=$(curl -s "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo")
CURRENT_URL=$(echo "$INFO" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result'].get('url','—'))")
echo "Текущий webhook: $CURRENT_URL"
echo ""
echo "📱 Теперь отправьте боту @eterapy_bot команду /start"
echo "   Нажмите Ctrl+C для остановки туннеля"
echo ""

# Ждём прерывания
wait $CLOUDFLARED_PID
