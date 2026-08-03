#!/usr/bin/env bash
# INC-095 — сколько релизных образов остаётся жить на ноде.
#
# Решение владельца 2026-08-03: на проде хранится текущий образ и максимум два
# предыдущих (откат на два релиза назад без сборки), на стенде — только
# текущий (стенд пересобирается из develop за минуты, откатывать его нечего).
#
# Почему это отдельный скрипт, а не строка в workflow: правило одно, а мест
# применения четыре — до загрузки и после конвергенции, в проде и на стенде.
# Раньше правило было размазано по двум workflow разными inline-строками, они
# разъехались, и стенд копил вытесненные образы по 4.5 GB на том же диске, где
# живёт боевой Postgres (см. «Второй виток» в INC-095).
#
# Использование:
#   retain-release-images.sh <repo> <container> <keep> [incoming_tag] [min_free_gb]
#
#   repo          репозиторий образа: eterapy-web | eterapy-web-staging
#   container     контейнер, чей образ считается «текущим» и НИКОГДА не удаляется
#   keep          сколько СУЩЕСТВУЮЩИХ образов оставить, считая текущий;
#                 приезжающий образ сверх этого числа и в лимит не входит
#   incoming_tag  тег приезжающего образа — не удаляем, даже если он старый
#   min_free_gb   если свободно меньше — снимаем ещё по одному запасному
#                 образу (никогда текущий и никогда incoming)
#
# Отказ чистки не должен ронять выкатку: не удалившийся образ — это потеря
# места, а не потеря релиза. Скрипт всегда завершается успехом.
#
# Намеренно без `mapfile` и без `set -e`: скрипт гоняется тестом и на macOS,
# где системный bash — 3.2, а пустой массив под `set -u` там ошибка.
set -u

REPO="${1:?repo required}"
CONTAINER="${2:?container required}"
KEEP="${3:?keep count required}"
INCOMING="${4:-}"
MIN_FREE_GB="${5:-0}"

docker_() { sudo docker "$@"; }

free_gb() { df -BG --output=avail / 2>/dev/null | tail -1 | tr -dc '0-9'; }

RUNNING="$(docker_ inspect --format '{{.Config.Image}}' "$CONTAINER" 2>/dev/null || true)"

# Новые сверху. На порядок вывода `docker images` не полагаемся — сортируем по
# метке создания явно.
LIST="$(docker_ images "$REPO" --format '{{.CreatedAt}}	{{.Repository}}:{{.Tag}}' 2>/dev/null \
  | sort -r | cut -f2)"

if [ -z "$LIST" ]; then
  echo "▶ образы $REPO: на ноде нет ни одного — чистить нечего"
  exit 0
fi

# Слот текущего образа занят всегда, независимо от его возраста: после отката
# работающим оказывается СТАРЫЙ образ, и «оставить N самых новых» снесло бы
# образ живого контейнера. Поэтому запасным достаётся KEEP минус текущий.
SPARE_SLOTS="$KEEP"
[ -n "$RUNNING" ] && SPARE_SLOTS=$(( KEEP - 1 ))
[ "$SPARE_SLOTS" -lt 0 ] && SPARE_SLOTS=0

SPARE=""   # удаляемые в крайнем случае, от новых к старым
DROP=""

while IFS= read -r img; do
  [ -z "$img" ] && continue
  if [ -n "$RUNNING" ] && [ "$img" = "$RUNNING" ]; then
    continue
  fi
  if [ -n "$INCOMING" ] && [ "$img" = "$REPO:$INCOMING" ]; then
    continue
  fi
  if [ "$SPARE_SLOTS" -gt 0 ]; then
    SPARE_SLOTS=$(( SPARE_SLOTS - 1 ))
    SPARE="$SPARE$img
"
  else
    DROP="$DROP$img
"
  fi
done <<EOF
$LIST
EOF

if [ -n "$DROP" ]; then
  echo "▶ образы $REPO: удаляю вытесненные — $(printf '%s' "$DROP" | tr '\n' ' ')"
  # shellcheck disable=SC2086
  docker_ rmi $(printf '%s' "$DROP") >/dev/null 2>&1 || true
fi

# Диск важнее политики хранения. Держать два предыдущих образа прода на диске
# 30 GB, где рядом стенд и Postgres, получается не всегда; тогда откат на два
# релиза назад приносится в жертву самой выкатке — но об этом должно быть
# сказано вслух, а не молча.
if [ "$MIN_FREE_GB" -gt 0 ] && [ -n "$SPARE" ]; then
  # от старых к новым: первым жертвуем самый дальний откат
  SPARE_OLDEST_FIRST="$(printf '%s' "$SPARE" | sed '1!G;h;$!d')"
  while IFS= read -r img; do
    [ -z "$img" ] && continue
    AVAIL="$(free_gb)"
    [ -n "$AVAIL" ] && [ "$AVAIL" -ge "$MIN_FREE_GB" ] && break
    echo "⚠ свободно ${AVAIL}G < ${MIN_FREE_GB}G — снимаю запасной образ $img (откат на него станет невозможен)"
    docker_ rmi "$img" >/dev/null 2>&1 || true
  done <<EOF
$SPARE_OLDEST_FIRST
EOF
fi

docker_ image prune -f >/dev/null 2>&1 || true
echo "▶ образы $REPO: осталось $(docker_ images "$REPO" --format '{{.Tag}}' 2>/dev/null | tr '\n' ' ')(свободно $(free_gb)G, текущий ${RUNNING:-нет})"
exit 0
