#!/usr/bin/env bash
# B552/B553/B572: SEO digest → Telegram.
#
# Ежедневно в 09:00 МСК по systemd-таймеру primary-ноды (B572). Раньше отчёт
# висел на расписании GitHub Actions и приходил как повезёт: замер по этому
# репозиторию — опоздания до 1ч55м и примерно половина запусков пропущена
# вовсе. `workflow_dispatch` в .github/workflows/seo-report.yml оставлен как
# ручной запуск.
#
# Креды берутся из env (так его зовёт GitHub Actions) либо, если там пусто, из
# /opt/eterapy/.env ноды (так его зовёт systemd). Ни один ключ в репозитории не
# лежит. DRY_RUN=1 печатает отчёт вместо отправки.
#
# Env: TG_TOKEN TG_CHAT YANDEX_OAUTH_TOKEN YANDEX_WEBMASTER_USER_ID
#      YANDEX_WEBMASTER_HOST_ID YANDEX_METRIKA_COUNTER_ID
#      YANDEX_WORDSTAT_API_KEY YANDEX_CLOUD_FOLDER_ID
set -euo pipefail

ENV_FILE="${ETERAPY_ENV_FILE:-/opt/eterapy/.env}"

# Значение читается, а не исполняется: `.env` ноды содержит пароли, в которых
# бывает всё что угодно, и source/eval на нём — это выполнение чужого текста.
from_env_file() {
  [ -r "$ENV_FILE" ] || return 0
  sed -n "s/^$1=//p" "$ENV_FILE" | head -1
}

TG_TOKEN="${TG_TOKEN:-$(from_env_file TELEGRAM_BOT_TOKEN)}"

# ⚠ ПОЧЕМУ НЕ api.telegram.org НАПРЯМУЮ (INC-098, найдено 2026-08-03).
# Нода стоит в РФ, где api.telegram.org недоступен. Приложение поэтому ходит
# через релей `TELEGRAM_API_BASE` (Cloudflare Worker), а этот скрипт до сих пор
# бил в Telegram напрямую — и умирал по таймауту `curl (28)` КАЖДЫЙ день с
# момента установки таймера: отчёт не пришёл владельцу ни разу. Отказ был виден
# только в `journalctl -u eterapy-seo-report`, куда никто не смотрит.
# Базовый адрес уже содержит `/bot<TOKEN>`, отдельный токен к нему не нужен.
TG_API_BASE="${TG_API_BASE:-$(from_env_file TELEGRAM_API_BASE)}"
if [ -z "$TG_API_BASE" ]; then
  TG_API_BASE="https://api.telegram.org/bot${TG_TOKEN}"
fi

# Владелец 2026-08-03: SEO/GEO/SMM и ответы клиентам — в отдельный
# маркетинговый канал, а не в шумный деплой-канал. `TELEGRAM_CHAT_ID` остаётся
# запасным адресом: молчаливая недоставка отчёта хуже, чем отчёт не туда.
TG_CHAT="${TG_CHAT:-$(from_env_file TELEGRAM_ETERAPY_MARKETING_CHAT_ID)}"
if [ -z "$TG_CHAT" ]; then
  TG_CHAT="$(from_env_file TELEGRAM_CHAT_ID)"
fi
YANDEX_OAUTH_TOKEN="${YANDEX_OAUTH_TOKEN:-$(from_env_file YANDEX_OAUTH_TOKEN)}"
YANDEX_WORDSTAT_API_KEY="${YANDEX_WORDSTAT_API_KEY:-$(from_env_file YANDEX_WORDSTAT_API_KEY)}"
YANDEX_CLOUD_FOLDER_ID="${YANDEX_CLOUD_FOLDER_ID:-$(from_env_file YANDEX_CLOUD_FOLDER_ID)}"

# Идентификаторы площадок — не секреты; держим умолчания здесь, чтобы у ноды и
# у workflow не было двух расходящихся копий.
YANDEX_WEBMASTER_USER_ID="${YANDEX_WEBMASTER_USER_ID:-253574184}"
YANDEX_WEBMASTER_HOST_ID="${YANDEX_WEBMASTER_HOST_ID:-https:eterapy.com:443}"
YANDEX_METRIKA_COUNTER_ID="${YANDEX_METRIKA_COUNTER_ID:-108502034}"
export YANDEX_METRIKA_COUNTER_ID

for required in TG_API_BASE TG_CHAT YANDEX_OAUTH_TOKEN; do
  if [ -z "${!required}" ]; then
    echo "SEO-отчёт: не задан $required (ни в env, ни в $ENV_FILE)" >&2
    exit 1
  fi
done

wm() { curl -sf -H "Authorization: OAuth $YANDEX_OAUTH_TOKEN" \
  "https://api.webmaster.yandex.net/v4/user/$YANDEX_WEBMASTER_USER_ID$1" || echo '{}'; }
mt() { curl -sf -H "Authorization: OAuth $YANDEX_OAUTH_TOKEN" \
  "https://api-metrika.yandex.net/stat/v1/data?ids=$YANDEX_METRIKA_COUNTER_ID&$1" || echo '{}'; }
ws() { curl -sf -X POST "https://searchapi.api.cloud.yandex.net/v2/wordstat/topRequests" \
  -H "Authorization: Api-Key $YANDEX_WORDSTAT_API_KEY" -H "Content-Type: application/json" \
  -d "{\"phrase\":\"$1\",\"numPhrases\":1,\"regions\":[\"225\"],\"folderId\":\"$YANDEX_CLOUD_FOLDER_ID\"}" || echo '{}'; }

HOST_ENC="${YANDEX_WEBMASTER_HOST_ID//:/%3A}"
SUMMARY=$(wm "/hosts/$HOST_ENC/summary")
QUERIES=$(wm "/hosts/$HOST_ENC/search-queries/popular?order_by=TOTAL_SHOWS&query_indicator=TOTAL_SHOWS&query_indicator=TOTAL_CLICKS&limit=8")
VISITS=$(mt "metrics=ym:s:visits,ym:s:users&date1=7daysAgo&date2=yesterday")
SEARCH=$(mt "metrics=ym:s:visits&dimensions=ym:s:lastSearchEngineRoot&date1=7daysAgo&date2=yesterday&sort=-ym:s:visits&limit=4")

CORE=$'матрица судьбы\nтаро онлайн\nнатальная карта онлайн\nсовместимость по дате рождения\nпсихолог онлайн\nии психолог'
WS_LINES=""
while IFS= read -r phrase; do
  count=$(ws "$phrase" | python3 -c "import json,sys;d=json.load(sys.stdin);r=d.get('results') or [{}];print(r[0].get('count','—'))" 2>/dev/null || echo "—")
  WS_LINES="$WS_LINES$phrase|$count"$'\n'
  sleep 1
done <<< "$CORE"

export SUMMARY QUERIES VISITS SEARCH WS_LINES
TEXT=$(python3 <<'PY'
import json, os
from datetime import date

def j(name):
    try: return json.loads(os.environ.get(name) or "{}")
    except Exception: return {}

def fmt(n):
    try: return f"{int(float(n)):,}".replace(",", " ")
    except Exception: return str(n)

s, q, v, se = j("SUMMARY"), j("QUERIES"), j("VISITS"), j("SEARCH")
L = [f"📈 <b>SEO-отчёт ETerapy — {date.today():%d.%m.%Y}</b>"]

if s:
    L.append("")
    L.append("🟡 <b>Яндекс.Вебмастер</b>")
    pairs = [("Страниц в поиске", s.get("searchable_pages_count")),
             ("Загружено роботом", s.get("downloaded_pages_count")),
             ("ИКС", s.get("sqi")),
             ("Ошибки сайта", s.get("site_problems", {}).get("FATAL") if isinstance(s.get("site_problems"), dict) else None)]
    L += [f"  {k}: <b>{fmt(x)}</b>" for k, x in pairs if x is not None]

qs = q.get("queries") or []
if qs:
    L.append("")
    L.append("🔎 <b>Топ запросов (показы → клики)</b>")
    for it in qs[:8]:
        ind = it.get("indicators", {})
        L.append(f"  {it.get('query_text','?')} — {fmt(ind.get('TOTAL_SHOWS',0))} → {fmt(ind.get('TOTAL_CLICKS',0))}")

tot = (v.get("totals") or [None])
if isinstance(tot, list) and tot and isinstance(tot[0], (int, float)):
    tot = [tot]
if v.get("totals"):
    t = v["totals"] if isinstance(v["totals"][0], (int, float)) else v["totals"][0]
    L.append("")
    L.append("📊 <b>Метрика, 7 дней</b>")
    L.append(f"  Визиты: <b>{fmt(t[0])}</b> · Пользователи: <b>{fmt(t[1])}</b>")
rows = se.get("data") or []
if rows:
    parts = [f"{r['dimensions'][0]['name']}: {fmt(r['metrics'][0][0])}" for r in rows]
    L.append(f"  Из поиска: {' · '.join(parts)}")

ws = [l for l in os.environ.get("WS_LINES", "").splitlines() if "|" in l]
if ws:
    L.append("")
    L.append("🗝 <b>Wordstat, спрос ядра (мес)</b>")
    L += [f"  {p} — {fmt(c)}" for p, c in (l.split('|', 1) for l in ws)]

L.append("")
L.append('<a href="https://webmaster.yandex.ru">Вебмастер</a> · <a href="https://metrika.yandex.ru/dashboard?id=' + os.environ.get("YANDEX_METRIKA_COUNTER_ID", "") + '">Метрика</a> · <a href="https://search.google.com/search-console">GSC</a>')
print("\n".join(L))
PY
)

if [ "${DRY_RUN:-}" = "1" ]; then printf '%s\n' "$TEXT"; exit 0; fi

# ⚠ ПОЧЕМУ НЕ ОДИН АДРЕС И ПОЧЕМУ НЕ `curl -f >/dev/null` (INC-098, 2026-08-03).
#
# Заданный `chat_id` не значит, что бот в этот чат вхож: пока бота не добавили
# администратором канала, Telegram отвечает `400 chat not found`. Ровно так
# отчёт и не дошёл во второй раз — релей уже работал, а канал был новый и
# пустой. С `-f` и `>/dev/null` в журнале оставалось «curl (22) error: 400»,
# по которому причину не отличить от неверного токена или битой разметки.
#
# Теперь: причина отказа печатается словами, а служебный канал остаётся
# запасным адресом ДОСТАВКИ, а не только конфигурации.
send_report() {
  local chat="$1" response ok
  response="$(curl -sS -X POST "${TG_API_BASE}/sendMessage" \
    --data-urlencode "chat_id=${chat}" \
    --data-urlencode "text=${TEXT}" \
    -d parse_mode=HTML -d disable_web_page_preview=true 2>&1)"
  ok="$(printf '%s' "$response" | sed -n 's/.*"ok":\([a-z]*\).*/\1/p' | head -1)"
  if [ "$ok" = "true" ]; then
    echo "SEO-отчёт отправлен в $chat"
    return 0
  fi
  echo "SEO-отчёт: чат $chat отказал — $(printf '%s' "$response" | head -c 300)" >&2
  return 1
}

TG_FALLBACK_CHAT="$(from_env_file TELEGRAM_CHAT_ID)"
if send_report "$TG_CHAT"; then
  exit 0
fi
if [ -n "$TG_FALLBACK_CHAT" ] && [ "$TG_FALLBACK_CHAT" != "$TG_CHAT" ]; then
  echo "SEO-отчёт: пробую служебный канал — отчёт не туда лучше, чем не доставленный" >&2
  send_report "$TG_FALLBACK_CHAT" && exit 0
fi
echo "SEO-отчёт: не доставлен ни в один канал" >&2
exit 1
