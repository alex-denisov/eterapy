#!/usr/bin/env bash
#
# B603 — залить аватар и обложку сообщества VK.
#
# Владелец 2026-07-27: «загрузи просто лого и обложку, там сейчас вообще пусто».
# Макеты лежат в `web/public/brand/vk/` и версионируются вместе с кодом:
# аватар 400×400, обложка 1590×400 с содержимым внутри центральной безопасной
# зоны 1196×400 (иначе мобильный кроп VK срежет знак и подпись).
#
# ⚠ Скрипту нужен ТОКЕН СООБЩЕСТВА со scope `photos`. `VK_SERVICE_TOKEN`,
#   который лежит в прод-окружении, не подойдёт: сервисный токен не имеет права
#   менять оформление сообщества.
#
#   Токен ожидается в `~/.eterapy/infra-credentials.env` строкой
#       VK_COMMUNITY_TOKEN=vk1.a....
#   На 27.07.2026 его там НЕТ — ни в этом файле, ни в GitHub-секретах, ни в
#   `/opt/eterapy/.env` на проде. Поэтому загрузка не выполнена, а вынесена
#   сюда: одна команда после того, как токен появится.
#
# Запуск:
#   ./deploy/vk-community-assets.sh
#
set -Eeuo pipefail

readonly GROUP_ID="240493895"
readonly API="https://api.vk.com/method"
readonly API_VERSION="5.199"
readonly ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly AVATAR="$ROOT/web/public/brand/vk/community-avatar.png"
readonly COVER="$ROOT/web/public/brand/vk/community-cover.png"
readonly CREDS="$HOME/.eterapy/infra-credentials.env"

# Файл кредов ведётся человеком и содержит комментарии-предложения без `#`,
# поэтому `source` целиком на нём падает. Берём ровно одну нужную строку.
if [[ -z "${VK_COMMUNITY_TOKEN:-}" && -r "$CREDS" ]]; then
  VK_COMMUNITY_TOKEN=$(sed -n 's/^VK_COMMUNITY_TOKEN=//p' "$CREDS" | tail -n 1)
  export VK_COMMUNITY_TOKEN
fi

if [[ -z "${VK_COMMUNITY_TOKEN:-}" ]]; then
  cat >&2 <<'MSG'
VK_COMMUNITY_TOKEN не найден.

Положите токен сообщества (не сервисный!) со scope `photos` в
~/.eterapy/infra-credentials.env строкой:

    VK_COMMUNITY_TOKEN=vk1.a....

и запустите скрипт снова.
MSG
  exit 1
fi

for file in "$AVATAR" "$COVER"; do
  [[ -r "$file" ]] || { printf 'нет файла: %s\n' "$file" >&2; exit 1; }
done

# `error` в ответе VK приходит с HTTP 200 — проверять надо тело, а не код.
vk_check() {
  local body="$1" what="$2"
  if printf '%s' "$body" | grep -q '"error"'; then
    printf '%s: VK вернул ошибку\n%s\n' "$what" "$body" >&2
    exit 1
  fi
}

printf 'Аватар…\n'
UPLOAD=$(curl -sS -G "$API/photos.getOwnerPhotoUploadServer" \
  --data-urlencode "owner_id=-$GROUP_ID" \
  --data-urlencode "access_token=$VK_COMMUNITY_TOKEN" \
  --data-urlencode "v=$API_VERSION")
vk_check "$UPLOAD" "photos.getOwnerPhotoUploadServer"
UPLOAD_URL=$(printf '%s' "$UPLOAD" | python3 -c 'import json,sys; print(json.load(sys.stdin)["response"]["upload_url"])')

UPLOADED=$(curl -sS -F "photo=@$AVATAR" "$UPLOAD_URL")
SERVER=$(printf '%s' "$UPLOADED" | python3 -c 'import json,sys; print(json.load(sys.stdin)["server"])')
PHOTO=$(printf '%s' "$UPLOADED" | python3 -c 'import json,sys; print(json.load(sys.stdin)["photo"])')
HASH=$(printf '%s' "$UPLOADED" | python3 -c 'import json,sys; print(json.load(sys.stdin)["hash"])')

SAVED=$(curl -sS -X POST "$API/photos.saveOwnerPhoto" \
  --data-urlencode "server=$SERVER" \
  --data-urlencode "photo=$PHOTO" \
  --data-urlencode "hash=$HASH" \
  --data-urlencode "access_token=$VK_COMMUNITY_TOKEN" \
  --data-urlencode "v=$API_VERSION")
vk_check "$SAVED" "photos.saveOwnerPhoto"
printf '  готово\n'

printf 'Обложка…\n'
COVER_UPLOAD=$(curl -sS -G "$API/photos.getOwnerCoverPhotoUploadServer" \
  --data-urlencode "group_id=$GROUP_ID" \
  --data-urlencode "crop_x=0" --data-urlencode "crop_y=0" \
  --data-urlencode "crop_x2=1590" --data-urlencode "crop_y2=400" \
  --data-urlencode "access_token=$VK_COMMUNITY_TOKEN" \
  --data-urlencode "v=$API_VERSION")
vk_check "$COVER_UPLOAD" "photos.getOwnerCoverPhotoUploadServer"
COVER_URL=$(printf '%s' "$COVER_UPLOAD" | python3 -c 'import json,sys; print(json.load(sys.stdin)["response"]["upload_url"])')

COVER_UPLOADED=$(curl -sS -F "photo=@$COVER" "$COVER_URL")
COVER_SAVED=$(curl -sS -X POST "$API/photos.saveOwnerCoverPhoto" \
  --data-urlencode "photo=$(printf '%s' "$COVER_UPLOADED" | python3 -c 'import json,sys; print(json.load(sys.stdin)["photo"])')" \
  --data-urlencode "hash=$(printf '%s' "$COVER_UPLOADED" | python3 -c 'import json,sys; print(json.load(sys.stdin)["hash"])')" \
  --data-urlencode "access_token=$VK_COMMUNITY_TOKEN" \
  --data-urlencode "v=$API_VERSION")
vk_check "$COVER_SAVED" "photos.saveOwnerCoverPhoto"
printf '  готово\n'

printf '\nОформление сообщества обновлено: https://vk.com/public%s\n' "$GROUP_ID"
