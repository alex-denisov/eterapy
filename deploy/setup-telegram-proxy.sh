#!/usr/bin/env bash
set -euo pipefail

# Setup Telegram Bot API proxy via Cloudflare Worker
# Required because api.telegram.org is blocked from the RU datacenter.

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  ETerapy Telegram Proxy Setup${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# 1. Check prerequisites
echo -e "${YELLOW}Step 1: Checking prerequisites...${NC}"

if ! command -v npx &>/dev/null; then
  echo -e "${RED}Error: npx not found. Install Node.js first.${NC}"
  exit 1
fi

if [ -z "${TELEGRAM_BOT_TOKEN:-}" ]; then
  echo -e "${RED}Error: TELEGRAM_BOT_TOKEN not set in environment.${NC}"
  echo -e "  export TELEGRAM_BOT_TOKEN='your-bot-token-from-botfather'"
  exit 1
fi

echo -e "${GREEN}✓ Prerequisites OK${NC}"
echo ""

# 2. Check if Wrangler is authenticated
echo -e "${YELLOW}Step 2: Checking Wrangler auth...${NC}"

if ! npx wrangler whoami &>/dev/null 2>&1; then
  echo -e "${YELLOW}Wrangler not authenticated. Starting login...${NC}"
  npx wrangler login
fi

echo -e "${GREEN}✓ Wrangler authenticated${NC}"
echo ""

# 3. Deploy the worker
echo -e "${YELLOW}Step 3: Deploying Cloudflare Worker...${NC}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

npx wrangler deploy telegram-proxy-wrangler.toml

echo -e "${GREEN}✓ Worker deployed${NC}"
echo ""

# 4. Detect worker URL from wrangler output
echo -e "${YELLOW}Step 4: Detecting Worker URL...${NC}"
WORKER_OUTPUT=$(npx wrangler deployments list 2>&1 || true)
WORKER_SUBDOMAIN=$(echo "$WORKER_OUTPUT" | grep -oE '[a-z0-9-]+\.workers\.dev' | head -1 || true)

if [ -z "${WORKER_SUBDOMAIN:-}" ]; then
  echo -e "${YELLOW}  Could not auto-detect worker subdomain.${NC}"
  echo -e "  Enter your Cloudflare workers.dev subdomain (e.g. my-account):"
  read -r CF_SUBDOMAIN
  WORKER_HOST="eterapy-telegram-proxy.${CF_SUBDOMAIN}.workers.dev"
else
  WORKER_HOST="${WORKER_SUBDOMAIN}"
fi

WORKER_URL="https://${WORKER_HOST}"
echo -e "${GREEN}  ✓ Worker URL: ${WORKER_URL}${NC}"
echo ""

# 5. Show env vars to set on VPS
API_BASE="${WORKER_URL}/bot${TELEGRAM_BOT_TOKEN}"
WEBHOOK_URL="${WORKER_URL}/webhook"
echo -e "${YELLOW}Step 5: Set these env vars on the VPS${NC}"
echo ""
echo -e "  ${CYAN}TELEGRAM_API_BASE=${API_BASE}${NC}"
echo -e "  ${CYAN}TELEGRAM_WEBHOOK_URL=${WEBHOOK_URL}${NC}"
echo -e "  ${CYAN}TELEGRAM_WEBHOOK_SECRET=${TELEGRAM_WEBHOOK_SECRET:-eterapy_wh_secret_2026}${NC}"
echo -e "  ${CYAN}TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}${NC}"
echo -e "  ${CYAN}TELEGRAM_BOT_USERNAME=eterapy_bot${NC}"
echo ""
echo -e "  Add them to /home/admin/eterapy/web/.env.local on the VPS,"
echo -e "  then: cd web && npm run build && pm2 restart eterapy --update-env"
echo ""

# 6. Register webhook pointing to the worker
echo -e "${YELLOW}Step 6: Registering webhook via Telegram API...${NC}"
RESULT=$(curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\": \"${WEBHOOK_URL}\",
    \"secret_token\": \"${TELEGRAM_WEBHOOK_SECRET:-eterapy_wh_secret_2026}\",
    \"allowed_updates\": [\"message\"]
  }")

if echo "$RESULT" | grep -q '"ok":true'; then
  echo -e "${GREEN}  ✓ Webhook registered: ${WEBHOOK_URL}${NC}"
else
  echo -e "${RED}  ✗ Webhook registration failed:${NC}"
  echo "  $RESULT"
fi
echo ""

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Setup complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "The worker now handles two directions:"
echo -e "  ${CYAN}Outbound${NC}: server → worker/bot<TOKEN>/method → api.telegram.org"
echo -e "  ${CYAN}Inbound${NC}:  Telegram → worker/webhook → eterapy.com/api/telegram/webhook"
echo ""
echo -e "Telegram binding flow:"
echo -e "  1. User goes to Settings → Notifications → Привязать Telegram"
echo -e "  2. User opens the deep-link in Telegram"
echo -e "  3. Bot receives /start <token> via worker relay"
echo -e "  4. Account linked!"
