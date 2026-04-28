#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-${ZAP_TARGET:-https://eterapy.com}}"
OUT_DIR="${ZAP_OUT_DIR:-docs/v5-release/security/zap}"
SPIDER_MINUTES="${ZAP_SPIDER_MINUTES:-2}"
IMAGE="${ZAP_IMAGE:-ghcr.io/zaproxy/zaproxy:stable}"

mkdir -p "$OUT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required to run OWASP ZAP baseline" >&2
  exit 2
fi

if ! docker info >/dev/null 2>&1; then
  echo "docker daemon is not running; start Docker and re-run this script" >&2
  exit 2
fi

echo "Running OWASP ZAP baseline against: $TARGET"
echo "Reports will be written to: $OUT_DIR"

docker run --rm \
  -v "$(pwd)/$OUT_DIR:/zap/wrk:rw" \
  "$IMAGE" \
  zap-baseline.py \
  -t "$TARGET" \
  -m "$SPIDER_MINUTES" \
  -r zap-baseline.html \
  -J zap-baseline.json \
  -w zap-baseline.md \
  -I

echo "ZAP baseline complete:"
echo "- $OUT_DIR/zap-baseline.html"
echo "- $OUT_DIR/zap-baseline.json"
echo "- $OUT_DIR/zap-baseline.md"
