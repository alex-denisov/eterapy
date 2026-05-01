#!/bin/bash
# ETerapy Deploy Status Checker
# Quick status check for all agents (Claude Code, Codex, Qwen, OpenCode)
# Usage: ./deploy/check-status.sh [options]
# Options:
#   --watch        Continuous monitoring (refresh every 30s)
#   --failed       Show only failed deployments
#   --logs <id>    Show logs for specific run ID

set -euo pipefail

REPO="eterapy/eterapy"
WORKFLOW="deploy.yml"

# Colors for terminal output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

show_help() {
    echo "ETerapy Deploy Status Checker"
    echo ""
    echo "Usage: ./deploy/check-status.sh [options]"
    echo ""
    echo "Options:"
    echo "  --watch        Continuous monitoring (refresh every 30s)"
    echo "  --failed       Show only failed deployments"
    echo "  --logs <id>    Show logs for specific run ID"
    echo "  --health       Quick health check of all endpoints"
    echo "  --help         Show this help message"
    echo ""
    echo "Examples:"
    echo "  ./deploy/check-status.sh                    # Latest status"
    echo "  ./deploy/check-status.sh --watch           # Monitor mode"
    echo "  ./deploy/check-status.sh --logs 123456789   # View specific logs"
    echo "  ./deploy/check-status.sh --health          # Check all endpoints"
}

check_gh_cli() {
    if ! command -v gh &> /dev/null; then
        echo "❌ GitHub CLI (gh) not found!"
        echo "   Install: https://cli.github.com/"
        echo ""
        echo "Alternative: Check status manually at:"
        echo "   https://github.com/$REPO/actions/workflows/$WORKFLOW"
        exit 1
    fi
    
    if ! gh auth status &> /dev/null; then
        echo "❌ Not authenticated with GitHub CLI!"
        echo "   Run: gh auth login"
        exit 1
    fi
}

get_latest_run() {
    gh run list --workflow="$WORKFLOW" --limit=1 --json databaseId,status,conclusion,createdAt,headBranch,headSha,url,workflowName,displayTitle 2>/dev/null || echo "[]"
}

format_status() {
    local status="$1"
    local conclusion="$2"
    
    if [ "$status" == "completed" ]; then
        if [ "$conclusion" == "success" ]; then
            echo -e "${GREEN}✅ SUCCESS${NC}"
        elif [ "$conclusion" == "failure" ]; then
            echo -e "${RED}❌ FAILED${NC}"
        elif [ "$conclusion" == "cancelled" ]; then
            echo -e "${YELLOW}⛔ CANCELLED${NC}"
        else
            echo -e "${YELLOW}⚠️ $conclusion${NC}"
        fi
    else
        echo -e "${BLUE}⏳ $status${NC}"
    fi
}

show_latest_status() {
    local run_json=$(get_latest_run)
    
    if [ "$run_json" == "[]" ] || [ -z "$run_json" ]; then
        echo "❌ No deployment runs found!"
        echo "   Check: https://github.com/$REPO/actions"
        return
    fi
    
    local run=$(echo "$run_json" | jq -r '.[0]')
    local id=$(echo "$run" | jq -r '.databaseId')
    local status=$(echo "$run" | jq -r '.status')
    local conclusion=$(echo "$run" | jq -r '.conclusion')
    local created=$(echo "$run" | jq -r '.createdAt')
    local branch=$(echo "$run" | jq -r '.headBranch')
    local sha=$(echo "$run" | jq -r '.headSha')
    local url=$(echo "$run" | jq -r '.url')
    local title=$(echo "$run" | jq -r '.displayTitle')
    
    echo "========================================"
    echo "  📊 ETerapy Deploy Status"
    echo "========================================"
    echo ""
    echo "Latest Run:     #$id"
    echo "Status:         $(format_status "$status" "$conclusion")"
    echo "Branch:         $branch"
    echo "Commit:         ${sha:0:7}"
    echo "Title:          $title"
    echo "Started:        $created"
    echo ""
    echo "GitHub URL:     $url"
    echo ""
    
    if [ "$conclusion" == "failure" ]; then
        echo -e "${RED}❌ Deployment failed!${NC}"
        echo ""
        echo "To see error logs, run:"
        echo "  ./deploy/check-status.sh --logs $id"
        echo ""
        echo "Or view in browser:"
        echo "  $url"
    elif [ "$status" == "in_progress" ]; then
        echo -e "${BLUE}⏳ Deployment in progress...${NC}"
        echo ""
        echo "Watch live: $url"
    else
        echo -e "${GREEN}✅ Latest deployment was successful!${NC}"
    fi
    
    echo ""
}

show_failed_runs() {
    echo "📋 Failed Deployments (last 10):"
    echo ""
    
    gh run list --workflow="$WORKFLOW" --limit=10 --json databaseId,status,conclusion,createdAt,headBranch,headSha,displayTitle,url | jq -r '.[] | select(.conclusion == "failure") | "\(.databaseId)\t\(.createdAt)\t\(.headBranch)\t\(.displayTitle)"' | while IFS=$'\t' read -r id date branch title; do
        echo "❌ Run #$id | $date | $branch | $title"
    done
    
    if [ -z "$(gh run list --workflow="$WORKFLOW" --limit=10 --json conclusion | jq -r '.[] | select(.conclusion == "failure")')" ]; then
        echo "✅ No failed deployments in last 10 runs!"
    fi
}

show_run_logs() {
    local run_id="$1"
    
    echo "📜 Logs for Run #$run_id:"
    echo ""
    gh run view "$run_id" --log-failed 2>/dev/null || {
        echo "❌ Could not retrieve logs for run $run_id"
        echo "   Check: https://github.com/$REPO/actions/runs/$run_id"
    }
}

health_check() {
    echo "🏥 Health Check:"
    echo ""
    
    local health_status=$(curl -s -o /dev/null -w '%{http_code}' https://eterapy.com/api/health || echo "000")
    local app_status=$(curl -s -o /dev/null -w '%{http_code}' https://app.eterapy.com || echo "000")
    local admin_status=$(curl -s -o /dev/null -w '%{http_code}' https://admin.eterapy.com || echo "000")
    
    echo -n "Main Site (eterapy.com):          "
    if [ "$health_status" == "200" ]; then
        echo -e "${GREEN}✅ OK ($health_status)${NC}"
    else
        echo -e "${RED}❌ FAIL ($health_status)${NC}"
    fi
    
    echo -n "App (app.eterapy.com):            "
    if [ "$app_status" == "200" ] || [ "$app_status" == "307" ] || [ "$app_status" == "308" ]; then
        echo -e "${GREEN}✅ OK ($app_status)${NC}"
    else
        echo -e "${RED}❌ FAIL ($app_status)${NC}"
    fi
    
    echo -n "Admin (admin.eterapy.com):        "
    if [ "$admin_status" == "200" ] || [ "$admin_status" == "307" ] || [ "$admin_status" == "308" ]; then
        echo -e "${GREEN}✅ OK ($admin_status)${NC}"
    else
        echo -e "${RED}❌ FAIL ($admin_status)${NC}"
    fi
    
    echo ""
}

watch_mode() {
    while true; do
        clear
        show_latest_status
        health_check
        echo ""
        echo "Press Ctrl+C to exit watch mode"
        sleep 30
    done
}

# Main
check_gh_cli

# Parse arguments
if [ $# -eq 0 ]; then
    show_latest_status
    health_check
elif [ "$1" == "--watch" ]; then
    watch_mode
elif [ "$1" == "--failed" ]; then
    show_failed_runs
elif [ "$1" == "--logs" ] && [ -n "${2:-}" ]; then
    show_run_logs "$2"
elif [ "$1" == "--health" ]; then
    health_check
elif [ "$1" == "--help" ] || [ "$1" == "-h" ]; then
    show_help
else
    echo "Unknown option: $1"
    show_help
    exit 1
fi
