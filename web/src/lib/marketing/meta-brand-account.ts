/**
 * B682 — публикуем ТОЛЬКО от брендовых страниц Meta.
 *
 * Решение владельца 2026-08-06: в Instagram и Threads заведены отдельные
 * страницы бренда, привязанные (дочерние) к его настоящему профилю. Заводить
 * под бренд отдельный аккаунт нельзя — это нарушение правил площадок, поэтому
 * связка именно такая. Публиковать разрешено только от этих страниц:
 *
 *   https://instagram.com/eterapy_official
 *   https://threads.com/eterapy_official
 *
 * ПОЧЕМУ ЭТО КОД, А НЕ ИНСТРУКЦИЯ. Токен и `*_USER_ID` заполняет OAuth. Если
 * владелец пройдёт вход не тем профилем — а тестировочные маркеры Meta он
 * получал именно личным аккаунтом (B655) — публикация уйдёт на его личную
 * страницу молча и от его имени. Отличить это по ответу площадки нельзя:
 * запрос успешен, пост опубликован, `publicUrl` выглядит нормально. Поэтому
 * адресат сверяется ДО первой публикации в процессе.
 *
 * ПОЧЕМУ КОНСТАНТА, А НЕ ПОЛЕ НАСТРОЕК. Поле можно заполнить тем же неверным
 * значением, что и `*_USER_ID`, и сверка перестанет что-либо значить. Смена
 * бренда — событие уровня выкатки, а не правки в админке
 * (`feedback_config_via_deploy`).
 */
import { metaEndpoint, metaRequestHeaders } from "@/lib/marketing/meta-endpoints";

export const META_BRAND_HANDLES = {
  threads: "eterapy_official",
  instagram: "eterapy_official",
} as const;

export type MetaBrandPlatform = keyof typeof META_BRAND_HANDLES;

/**
 * Сверка делается один раз на процесс и на пару (площадка, аккаунт): токен и id
 * меняются только выкаткой или повторным OAuth, а лишний вызов к Meta с
 * российской ноды идёт через релей и стоит времени на каждой публикации.
 */
const verified = new Map<string, string>();

/** Только для прогонов: сбрасывает память процесса о проверенных аккаунтах. */
export function resetMetaBrandAccountCache() {
  verified.clear();
}

function normalizeHandle(value: string): string {
  return value.trim().replace(/^@/, "").toLowerCase();
}

async function fetchUsername(platform: MetaBrandPlatform, token: string): Promise<string | null> {
  // Обе площадки отдают имя аккаунта токена по `me`; версия пути у них разная.
  const path = platform === "threads" ? "v1.0/me" : "v25.0/me";
  const response = await fetch(
    `${metaEndpoint(platform)}/${path}?fields=id,username&access_token=${encodeURIComponent(token)}`,
    { headers: metaRequestHeaders() },
  );
  const payload = await response.json().catch(() => null) as
    | { username?: string; error?: { message?: string } }
    | null;
  if (!response.ok || !payload?.username) {
    throw new Error(
      `Не удалось проверить адресата ${platform}: ${payload?.error?.message ?? `HTTP ${response.status}`}`,
    );
  }
  return payload.username;
}

/**
 * Пускает публикацию дальше, только если токен принадлежит брендовой странице.
 *
 * Бросает — то есть материал уйдёт в отказ с внятной причиной, а не опубликуется
 * не туда. Отказ здесь относится к КАНАЛУ (настройка), а не к материалу:
 * повторная попытка тем же текстом смысла не имеет, пока не переподключён
 * правильный аккаунт (`feedback_pause_channel_not_cancel_material`).
 */
export async function assertMetaBrandAccount(input: {
  platform: MetaBrandPlatform;
  token: string;
  userId: string;
}): Promise<void> {
  const expected = META_BRAND_HANDLES[input.platform];
  const cacheKey = `${input.platform}:${input.userId}`;
  const known = verified.get(cacheKey);
  if (known && normalizeHandle(known) === expected) return;

  const username = await fetchUsername(input.platform, input.token);
  if (!username || normalizeHandle(username) !== expected) {
    throw new Error(
      `Публикация в ${input.platform} остановлена: токен принадлежит аккаунту `
      + `«${username ?? "неизвестно"}», а публиковать разрешено только от брендовой `
      + `страницы «${expected}». Пройдите подключение заново под страницей бренда.`,
    );
  }
  verified.set(cacheKey, username);
}
