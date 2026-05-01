#!/bin/bash
# Test Telegram Bot for ETerapy Deploy Notifications
# Usage: ./deploy/test-telegram.sh [message]
# Example: ./deploy/test-telegram.sh "🧪 Test notification from ETerapy"

set -euo pipefail

# Default test message
MESSAGE="${1:-🧪 ETerapy Telegram Test\n\nThis is a test notification from deploy script.\n\nIf you see this message, your Telegram bot is configured correctly! ✅}"

# Bot credentials (from environment or prompt)
TOKEN="${TELEGRAM_BOT_TOKEN:-}"
CHAT_ID="${TELEGRAM_CHAT_ID:-}"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "🚀 ETerapy Telegram Bot Test"
echo "=============================="
echo ""

# Check if credentials are provided
if [ -z "$TOKEN" ]; then
    echo -e "${YELLOW}⚠️ TELEGRAM_BOT_TOKEN not set in environment.${NC}"
    echo ""
    read -p "Enter Telegram Bot Token (or press Ctrl+C to cancel): " TOKEN
    echo ""
fi

if [ -z "$CHAT_ID" ]; then
    echo -e "${YELLOW}⚠️ TELEGRAM_CHAT_ID not set in environment.${NC}"
    echo ""
    read -p "Enter Telegram Chat ID (or press Ctrl+C to cancel): " CHAT_ID
    echo ""
fi

# Validate inputs
if [ -z "$TOKEN" ] || [ -z "$CHAT_ID" ]; then
    echo -e "${RED}❌ Error: Both TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required!${NC}"
    echo ""
    echo "Usage:"
    echo "  TELEGRAM_BOT_TOKEN='your-token' TELEGRAM_CHAT_ID='your-chat-id' ./deploy/test-telegram.sh"
    echo ""
    echo "Or set environment variables:"
    echo "  export TELEGRAM_BOT_TOKEN='your-token'"
    echo "  export TELEGRAM_CHAT_ID='your-chat-id'"
    exit 1
fi

echo "📤 Sending test message to Telegram..."
echo "   Bot: ${TOKEN:0:10}..."
echo "   Chat: $CHAT_ID"
echo ""

# Send message via Telegram API
RESPONSE=$(curl -s -X POST "https://api.telegram.org/bot${TOKEN}/sendMessage" \
    -d "chat_id=${CHAT_ID}" \
    -d "text=${MESSAGE}" \
    -d "parse_mode=HTML" \
    -d "disable_web_page_preview=true" 2>&1) || {
    echo -e "${RED}❌ Failed to send request to Telegram API!${NC}"
    echo "Error: $RESPONSE"
    exit 1
}

# Check response
if echo "$RESPONSE" | grep -q '"ok":true'; then
    echo -e "${GREEN}✅ Message sent successfully!${NC}"
    echo ""
    echo "Response preview:"
    echo "$RESPONSE" | head -c 200
    echo ""
    echo ""
    echo -e "${GREEN}🎉 Telegram bot is working correctly!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Add these credentials to GitHub Secrets:"
    echo "   - TELEGRAM_BOT_TOKEN"
    echo "   - TELEGRAM_CHAT_ID"
    echo ""
    echo "2. GitHub repository settings:"
    echo "   https://github.com/eterapy/eterapy/settings/secrets/actions"
    echo ""
    exit 0
else
    echo -e "${RED}❌ Telegram API returned an error!${NC}"
    echo ""
    echo "Full response:"
    echo "$RESPONSE" | sed 's/^/   /'
    echo ""
    
    # Common error diagnosis
    if echo "$RESPONSE" | grep -q 'chat not found'; then
        echo -e "${YELLOW}💡 Diagnosis: Chat ID not found.${NC}"
        echo "   Make sure the bot is added to the channel/group."
        echo "   For channels, add the bot as an administrator."
        echo ""
    elif echo "$RESPONSE" | grep -q 'unauthorized'; then
        echo -e "${YELLOW}💡 Diagnosis: Invalid bot token.${NC}"
        echo "   Check your token from @BotFather."
        echo ""
    elif echo "$RESPONSE" | grep -q 'Forbidden'; then
        echo -e "${YELLOW}💡 Diagnosis: Bot cannot send messages to this chat.${NC}"
        echo "   Make sure the bot has permission to send messages."
        echo "   For channels: add bot as admin with 'Post Messages' permission."
        echo ""
    fi
    
    exit 1
fi
