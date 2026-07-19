#!/usr/bin/env bash
# B552: weekly SEO report — Yandex Webmaster + Metrika + Wordstat snapshot.
# Reads credentials from repo-root .env.deploy (gitignored). Writes a markdown
# report to docs/v5-release/seo-reports/YYYY-MM-DD.md (docs stay local-only).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/.env.deploy"
: "${YANDEX_OAUTH_TOKEN:?}" "${YANDEX_WEBMASTER_USER_ID:?}" "${YANDEX_WEBMASTER_HOST_ID:?}"
: "${YANDEX_METRIKA_COUNTER_ID:?}" "${YANDEX_WORDSTAT_API_KEY:?}" "${YANDEX_CLOUD_FOLDER_ID:?}"

OUT_DIR="$ROOT/docs/v5-release/seo-reports"
mkdir -p "$OUT_DIR"
OUT="$OUT_DIR/$(date +%F).md"

wm() { curl -sf -H "Authorization: OAuth $YANDEX_OAUTH_TOKEN" \
  "https://api.webmaster.yandex.net/v4/user/$YANDEX_WEBMASTER_USER_ID$1" || echo '{}'; }
mt() { curl -sf -H "Authorization: OAuth $YANDEX_OAUTH_TOKEN" \
  "https://api-metrika.yandex.net/stat/v1/data?ids=$YANDEX_METRIKA_COUNTER_ID&$1" || echo '{}'; }
ws() { curl -sf -X POST "https://searchapi.api.cloud.yandex.net/v2/wordstat/topRequests" \
  -H "Authorization: Api-Key $YANDEX_WORDSTAT_API_KEY" -H "Content-Type: application/json" \
  -d "{\"phrase\":\"$1\",\"numPhrases\":1,\"regions\":[\"225\"],\"folderId\":\"$YANDEX_CLOUD_FOLDER_ID\"}" || echo '{}'; }

HOST_ENC="${YANDEX_WEBMASTER_HOST_ID//:/%3A}"
SUMMARY=$(wm "/hosts/$HOST_ENC/summary")
QUERIES=$(wm "/hosts/$HOST_ENC/search-queries/popular?order_by=TOTAL_SHOWS&query_indicator=TOTAL_SHOWS&query_indicator=TOTAL_CLICKS&limit=15")
VISITS=$(mt "metrics=ym:s:visits,ym:s:users&date1=7daysAgo&date2=yesterday")
SEARCH=$(mt "metrics=ym:s:visits&dimensions=ym:s:lastSearchEngineRoot&date1=7daysAgo&date2=yesterday&sort=-ym:s:visits&limit=5")

# core-phrase frequency snapshot (broad match, RU) — trend over time
CORE_PHRASES=("матрица судьбы" "таро онлайн" "натальная карта онлайн" "совместимость по дате рождения" "психолог онлайн" "ии психолог")

{
  echo "# SEO weekly — $(date +%F)"
  echo
  echo "## Яндекс.Вебмастер (${YANDEX_WEBMASTER_HOST_ID})"
  echo '```json'
  echo "$SUMMARY"
  echo '```'
  echo
  echo "## Топ поисковых запросов (показы/клики, Вебмастер)"
  echo '```json'
  echo "$QUERIES"
  echo '```'
  echo
  echo "## Метрика — визиты/пользователи за 7 дней"
  echo '```json'
  echo "$VISITS" | python3 -c "import json,sys;d=json.load(sys.stdin);print(json.dumps(d.get('totals',d),ensure_ascii=False))" 2>/dev/null || echo "$VISITS"
  echo '```'
  echo
  echo "## Метрика — визиты из поисковиков (7 дней)"
  echo '```json'
  echo "$SEARCH" | python3 -c "import json,sys;d=json.load(sys.stdin);print(json.dumps([{ 'engine':r['dimensions'][0]['name'],'visits':r['metrics'][0][0]} for r in d.get('data',[])],ensure_ascii=False))" 2>/dev/null || echo "$SEARCH"
  echo '```'
  echo
  echo "## Wordstat — частотность ядра (RU, broad, 30 дней)"
  for p in "${CORE_PHRASES[@]}"; do
    c=$(ws "$p" | python3 -c "import json,sys;d=json.load(sys.stdin);r=d.get('results') or [{}];print(r[0].get('count','n/a'))" 2>/dev/null || echo n/a)
    echo "- $p — $c"
    sleep 1
  done
} > "$OUT"

echo "report: $OUT"
