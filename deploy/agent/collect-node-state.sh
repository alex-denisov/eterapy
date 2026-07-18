#!/usr/bin/env bash
# B544 — host-side collector for the fleet monitoring panel.
#
# Приложение живёт в контейнере и НАМЕРЕННО не имеет доступа к docker-сокету
# (сокет = root на хосте). Поэтому состояние хоста собирает этот скрипт под
# systemd-таймером и кладёт в /opt/eterapy/state/node-state.json, который
# монтируется в контейнер read-only.
#
# Никаких секретов в выводе: только имена, образы, статусы и размеры.
set -euo pipefail

STATE_DIR="${NODE_STATE_DIR:-/opt/eterapy/state}"
OUT="$STATE_DIR/node-state.json"
TMP="$OUT.tmp"
BACKUP_ENV_FILE="${BACKUP_ENV:-/opt/eterapy/backup.env}"
[ -f "$BACKUP_ENV_FILE" ] && . "$BACKUP_ENV_FILE"
BACKUP_DIR="${BACKUP_LOCAL_DIR:-/opt/eterapy/backups}"

mkdir -p "$STATE_DIR"

# --- контейнеры: имя, образ, тег, состояние, health, аптайм ------------------
containers_json() {
  docker ps --all --no-trunc \
    --format '{{.Names}}\t{{.Image}}\t{{.State}}\t{{.Status}}\t{{.RunningFor}}' 2>/dev/null \
  | awk -F'\t' '
      BEGIN { printf "[" ; first = 1 }
      {
        name = $1; image = $2; state = $3; status = $4; uptime = $5;
        tag = image; sub(/^.*:/, "", tag); if (tag == image) tag = "latest";
        health = "";
        if (status ~ /\(healthy\)/)   health = "healthy";
        else if (status ~ /\(unhealthy\)/) health = "unhealthy";
        else if (status ~ /\(health: starting\)/) health = "starting";
        gsub(/"/, "\\\"", name); gsub(/"/, "\\\"", image);
        gsub(/"/, "\\\"", state); gsub(/"/, "\\\"", uptime);
        if (!first) printf ",";
        printf "{\"name\":\"%s\",\"image\":\"%s\",\"tag\":\"%s\",\"state\":\"%s\",\"health\":\"%s\",\"uptime\":\"%s\"}",
               name, image, tag, state, health, uptime;
        first = 0;
      }
      END { printf "]" }
    '
}

# --- бэкапы: свежесть последнего дампа и состояние таймера -------------------
backup_json() {
  local latest age size timer="unknown"
  if command -v systemctl >/dev/null 2>&1; then
    # `is-active` на несуществующем юните печатает "inactive" И падает —
    # без head -1 в JSON уезжал перевод строки и ломал разбор.
    # is-active падает с кодом 3 на неактивном юните, а pipefail роняет
            # весь скрипт — поэтому явный `|| true`.
    timer="$(systemctl is-active eterapy-backup.timer 2>/dev/null | head -1 || true)"
    [ -n "$timer" ] || timer="inactive"
  fi
  latest="$(ls -1t "$BACKUP_DIR"/*.gpg 2>/dev/null | head -1 || true)"
  if [ -n "$latest" ]; then
    age=$(( $(date +%s) - $(stat -c %Y "$latest" 2>/dev/null || echo 0) ))
    size=$(stat -c %s "$latest" 2>/dev/null || echo 0)
    printf '{"timer":"%s","lastFile":"%s","ageSec":%d,"sizeBytes":%d}' \
      "$timer" "$(basename "$latest")" "$age" "$size"
  else
    printf '{"timer":"%s","lastFile":null,"ageSec":null,"sizeBytes":null}' "$timer"
  fi
}

# --- бакеты: свежесть последней копии в каждом S3-remote --------------------
# rclone-конфиг живёт на хосте — креды S3 в приложение НЕ попадают.
buckets_json() {
  local first=1
  printf '['
  if command -v rclone >/dev/null 2>&1; then
    for remote in ${BACKUP_REMOTES:-}; do
      local newest age count name
      # Самый свежий объект: сортируем по имени (имена содержат UTC-таймштамп).
      newest="$(rclone lsf "$remote" --files-only 2>/dev/null | sort | tail -1 || true)"
      count="$(rclone lsf "$remote" --files-only 2>/dev/null | grep -c . || echo 0)"
      count="${count:-0}"
      name="${remote%%:*}"
      if [ -n "$newest" ]; then
        # Штамп вида ...-20260718T092419Z.dump.gpg → секунды с эпохи.
        local stamp
        stamp="$(printf '%s' "$newest" | grep -oE '[0-9]{8}T[0-9]{6}Z' | tail -1 || true)"
        if [ -n "$stamp" ]; then
          age=$(( $(date +%s) - $(date -u -d "${stamp:0:8} ${stamp:9:2}:${stamp:11:2}:${stamp:13:2}" +%s 2>/dev/null || echo 0) ))
        else
          age=null
        fi
        [ "$first" = 1 ] || printf ','
        printf '{"remote":"%s","objects":%s,"lastObject":"%s","ageSec":%s,"ok":true}' \
          "$name" "$count" "$newest" "${age:-null}"
      else
        [ "$first" = 1 ] || printf ','
        printf '{"remote":"%s","objects":0,"lastObject":null,"ageSec":null,"ok":false}' "$name"
      fi
      first=0
    done
  fi
  printf ']'
}

# --- HAProxy (B540): развёрнут ли балансировщик на этой ноде -----------------
haproxy_json() {
  local state="absent" version=""
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^eterapy-haproxy'; then
    state="running"
    version="$(docker exec eterapy-haproxy-1 haproxy -v 2>/dev/null | head -1 | tr -d '\r\n"' || true)"
  elif [ -f /opt/eterapy/haproxy.cfg ]; then
    state="configured"
  fi
  printf '{"state":"%s","version":"%s"}' "$state" "${version//\"/}"
}

{
  printf '{"collectedAt":"%s","containers":' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  containers_json || printf '[]'
  printf ',"backup":'
  backup_json
  printf ',"buckets":'
  buckets_json
  printf ',"haproxy":'
  haproxy_json
  printf '}\n'
} > "$TMP"

# Публикуем атомарно: приложение никогда не увидит полуфайл.
mv "$TMP" "$OUT"
chmod 0644 "$OUT"
