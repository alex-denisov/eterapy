/**
 * B599 · Отписка от рекламных сообщений.
 *
 * Ссылка в каждом письме — не украшение и не вежливость: без неё рассылку
 * нельзя включать вовсе (38-ФЗ ст. 18 — отказ должен быть исполнен немедленно).
 *
 * ПОЧЕМУ ПОДПИСАННЫЙ ТОКЕН, А НЕ ЗАПИСЬ В БАЗЕ. Хранимый одноразовый токен
 * пришлось бы порождать на каждое письмо, чистить по сроку и — главное —
 * объяснять человеку, почему ссылка из письма полугодовой давности «устарела».
 * Отписка обязана работать всегда, из любого старого письма. Подпись HMAC даёт
 * ровно это: ничего не хранится, подделать нельзя, а повторное использование
 * безвредно — отписаться дважды это то же самое, что отписаться один раз.
 *
 * ЧТО ТОКЕН РАЗРЕШАЕТ. Ровно одно действие: поставить человеку отписку. Ни
 * входа, ни чтения данных, ни отмены отписки — обратно человек включает
 * рассылку только из своего кабинета, под своим паролем.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/** Домен подписи. Свой префикс не даёт переиспользовать токен гостевой сессии. */
const TOKEN_SCOPE = "marketing-unsubscribe";

function secret(): string {
  const configured = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET не задан — ссылку отписки подписать нечем");
  }
  return "development-unsubscribe-secret";
}

function sign(userId: string): string {
  return createHmac("sha256", secret()).update(`${TOKEN_SCOPE}:${userId}`).digest("base64url");
}

/** Токен для ссылки: `<userId>.<подпись>`. */
export function createUnsubscribeToken(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

/** Разбор токена. `null` — подпись не сошлась или форма не та. */
export function parseUnsubscribeToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;
  const userId = token.slice(0, separator);
  const provided = token.slice(separator + 1);
  const expected = sign(userId);
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  if (expectedBytes.length !== providedBytes.length) return null;
  return timingSafeEqual(expectedBytes, providedBytes) ? userId : null;
}

/** Путь страницы отписки. Публичный: человек может быть не залогинен. */
export const UNSUBSCRIBE_PATH = "/unsubscribe";

export function unsubscribeUrl(userId: string, origin: string): string {
  return `${origin.replace(/\/+$/, "")}${UNSUBSCRIBE_PATH}?t=${encodeURIComponent(createUnsubscribeToken(userId))}`;
}

/**
 * Приписка к телу письма. Клеится ОТПРАВИТЕЛЕМ, а не руками в каждом шаблоне:
 * шаблон без ссылки — это письмо, которое уйдёт без неё, и заметят это снаружи.
 */
export function withUnsubscribeFooter(body: string, url: string): string {
  return `${body}\n\n—\nЭто рекламное сообщение. Отписаться: ${url}`;
}
