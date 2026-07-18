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

# --- Репликация PG (B537) ---------------------------------------------------
# Во флоте две топологии сразу: на eterapy-1 Postgres нативный (Debian-пакет),
# на остальных — контейнер. Пробуем оба доступа, наружу отдаём одинаковый JSON.
# Только статусы и числа: ни строк подключения, ни паролей.
psql_q() {
  local sql="$1" out=""
  if command -v psql >/dev/null 2>&1 && id postgres >/dev/null 2>&1; then
    out="$(sudo -u postgres psql -Atc "$sql" 2>/dev/null | head -1 || true)"
    [ -n "$out" ] && { printf '%s' "$out"; return 0; }
  fi
  local c
  c="$(docker ps --format '{{.Names}}' 2>/dev/null | grep -E '^eterapy-db' | head -1 || true)"
  if [ -n "$c" ]; then
    # Суперюзер контейнера зависит от POSTGRES_USER: на eterapy-2 это postgres
    # (данные приехали basebackup'ом с eterapy-1), на 3/4 — eterapy.
    local u
    for u in postgres eterapy; do
      out="$(docker exec "$c" psql -U "$u" -Atc "$sql" 2>/dev/null | grep -v '^WARNING' | head -1 || true)"
      [ -n "$out" ] && { printf '%s' "$out"; return 0; }
    done
  fi
  return 1
}

replication_json() {
  local in_recovery
  in_recovery="$(psql_q 'select pg_is_in_recovery()' || true)"

  if [ -z "$in_recovery" ]; then
    printf '{"role":"none","ok":false,"streamStatus":"","lagSeconds":null,"replicas":[]}'
    return
  fi

  if [ "$in_recovery" = "t" ]; then
    # Standby: идёт ли поток и насколько отстаём по времени от primary.
    local status lag ok
    status="$(psql_q 'select status from pg_stat_wal_receiver' || true)"
    status="$(printf '%s' "${status:-unknown}" | tr -cd 'a-z_-')"
    # ВАЖНО: голый pg_last_xact_replay_timestamp() врёт на простое — он растёт,
    # пока на primary просто нет транзакций, хотя реплика догнана. Поэтому
    # сначала сверяем LSN: приняли == проиграли ⇒ отставание ноль.
    lag="$(psql_q 'select case when pg_last_wal_receive_lsn() = pg_last_wal_replay_lsn() then 0
                        else coalesce(round(extract(epoch from now() - pg_last_xact_replay_timestamp()))::bigint, 0) end' || true)"
    lag="$(printf '%s' "${lag:-}" | tr -cd '0-9-')"
    [ "$status" = "streaming" ] && ok=true || ok=false
    printf '{"role":"standby","ok":%s,"streamStatus":"%s","lagSeconds":%s,"replicas":[]}' \
      "$ok" "$status" "${lag:-null}"
    return
  fi

  # Primary. Отличаем «реплика настроена и отвалилась» от «репликации тут
  # нет и не задумывалось»: признак — наличие слота. Без этого eterapy-3/4,
  # самостоятельные ноды Foreign-контура, вечно горели бы «нет реплик».
  local slots
  slots="$(psql_q 'select count(*) from pg_replication_slots' || true)"
  slots="$(printf '%s' "${slots:-0}" | tr -cd '0-9')"
  if [ "${slots:-0}" = "0" ]; then
    printf '{"role":"none","ok":true,"streamStatus":"","lagSeconds":null,"replicas":[]}'
    return
  fi

  # Слот есть — значит реплику ждём. Пустой список опаснее, чем выглядит:
  # слот держит WAL, и при долгом отвале standby диск primary кончится.
  local rows count=0 list="" entry
  rows="$(psql_q "select coalesce(string_agg(application_name||'~'||state||'~'||coalesce(pg_wal_lsn_diff(sent_lsn,replay_lsn),0)::bigint,'|'),'') from pg_stat_replication" || true)"
  if [ -n "${rows:-}" ]; then
    local OLDIFS="$IFS"; IFS='|'
    for entry in $rows; do
      IFS="$OLDIFS"
      local name="${entry%%~*}" rest="${entry#*~}"
      local state="${rest%%~*}" bytes="${rest##*~}"
      name="$(printf '%s' "$name" | tr -cd 'A-Za-z0-9_.-')"
      state="$(printf '%s' "$state" | tr -cd 'a-z')"
      bytes="$(printf '%s' "$bytes" | tr -cd '0-9-')"
      [ "$count" = 0 ] || list="$list,"
      list="$list{\"name\":\"$name\",\"state\":\"$state\",\"lagBytes\":${bytes:-0}}"
      count=$((count + 1))
      IFS='|'
    done
    IFS="$OLDIFS"
  fi
  local ok=false
  [ "$count" -gt 0 ] && ok=true
  printf '{"role":"primary","ok":%s,"streamStatus":"","lagSeconds":null,"replicas":[%s]}' "$ok" "$list"
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
  printf ',"replication":'
  replication_json || printf '{"role":"none","ok":false,"streamStatus":"","lagSeconds":null,"replicas":[]}'
  printf '}\n'
} > "$TMP"

# Публикуем атомарно: приложение никогда не увидит полуфайл.
mv "$TMP" "$OUT"
chmod 0644 "$OUT"
