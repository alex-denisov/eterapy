/**
 * B742 — доступ к Vertex AI по сервисному аккаунту Google Cloud.
 *
 * ⚠ ПОЧЕМУ ЭТО ВООБЩЕ ПОНАДОБИЛОСЬ. Владелец 2026-09-12: «Я точно не хочу
 * ничего добавлять из своего кошелька, но хочу использовать бонусы, хоть
 * какие-то (желательно вообще все)». У него два бонуса, и они живут в разных
 * местах:
 *
 *   • $10/мес Developer Program (подписка Google AI Pro) тратится на Gemini API
 *     в AI Studio — именно там, где контур работает сейчас;
 *   • $300 пробного периода Google Cloud на Gemini API в AI Studio НЕ
 *     распространяются — Google вынес этот продукт из покрытия отдельным
 *     пунктом. Зато они покрывают Vertex AI (с мая 2026 — Gemini Enterprise
 *     Agent Platform), где живут ТЕ ЖЕ первые модели Gemini.
 *
 * То есть $300 нельзя потратить там, где мы стоим, и можно — на соседнем
 * маршруте к той же модели. Это и есть вся причина существования файла.
 *
 * ⚠ ПОЧЕМУ НЕ «ФЛАГ is vertex», КАК ПРЕДПОЛАГАЛ ВЛАДЕЛЕЦ. Тело запроса у
 * Vertex и AI Studio действительно совпадает до поля — но совпадает только
 * оно. Различаются хост (`{регион}-aiplatform.googleapis.com`), путь (в нём
 * номер проекта и регион) и, главное, способ доказать, что это мы: AI Studio
 * принимает ключ строкой в заголовке, Vertex — только OAuth2-токен, который
 * надо каждый час выпускать заново, подписывая JWT закрытым ключом сервисного
 * аккаунта. Флага мало; нужен вот этот файл.
 *
 * ⚠ ТОКЕН ВЫПУСКАЕТСЯ САМ И КЭШИРУЕТСЯ. Час жизни минус запас: попасть в отказ
 * ровно на границе — самый неприятный вид отказа, он выглядит как случайный.
 * Тот же приём, что у Search Console (`search-console.ts`).
 */

import { createSign } from "node:crypto";

/** Токен живёт час; берём запас, чтобы не попасть в отказ на границе. */
const TOKEN_SAFETY_MS = 5 * 60_000;
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/cloud-platform";

export interface GoogleServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

/**
 * Разобрать секрет как сервисный аккаунт.
 *
 * `null`, а не исключение: ровно этим вызывающий и отличает «ключ AI Studio»
 * от «сервисный аккаунт Vertex». Обычный ключ AI Studio — строка вида
 * `AIza…`, и он честно не разбирается как JSON.
 *
 * ⚠ ПРИНИМАЕТСЯ И BASE64, И ЭТО НЕ ЛЮБЕЗНОСТЬ. Секреты доезжают на прод
 * построчно — одна переменная, одна строка `.env`. JSON сервисного аккаунта
 * многострочный и полон кавычек: положенный как есть, он обрывается на первом
 * переводе строки и приезжает битым. Рекомендованный вид секрета —
 * `base64 -w0` от файла; сырой JSON тоже читается, чтобы вставка в панель
 * суперадминки работала без предварительной кодировки.
 */
export function parseServiceAccount(secret: string | null | undefined): GoogleServiceAccount | null {
  const trimmed = secret?.trim();
  if (!trimmed) return null;
  const json = trimmed.startsWith("{") ? trimmed : decodeBase64(trimmed);
  if (!json) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const row = parsed as Record<string, unknown>;
  if (row.type !== "service_account") return null;
  const projectId = typeof row.project_id === "string" ? row.project_id.trim() : "";
  const clientEmail = typeof row.client_email === "string" ? row.client_email.trim() : "";
  const privateKey = typeof row.private_key === "string" ? row.private_key : "";
  // ⚠ Все три поля обязательны. Частично заполненный аккаунт — это 401 в бою и
  // час разбирательств: пусть лучше маршрут честно не поднимется.
  if (!projectId || !clientEmail || !privateKey.includes("PRIVATE KEY")) return null;
  return {
    projectId,
    clientEmail,
    // Переменные окружения и формы админки хранят перевод строки как `\n`.
    privateKey: privateKey.replace(/\\n/g, "\n"),
  };
}

/** base64 → текст. `null`, если это не base64 или внутри не JSON. */
function decodeBase64(value: string): string | null {
  if (!/^[A-Za-z0-9+/=\s]+$/.test(value)) return null;
  try {
    const decoded = Buffer.from(value, "base64").toString("utf8").trim();
    return decoded.startsWith("{") ? decoded : null;
  } catch {
    return null;
  }
}

function base64url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Подписанный JWT, которым сервисный аккаунт представляется Google. */
export function signServiceAccountJwt(
  account: GoogleServiceAccount,
  now = Date.now(),
): string {
  const issuedAt = Math.floor(now / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    iss: account.clientEmail,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: issuedAt,
    exp: issuedAt + 3600,
  }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  signer.end();
  return `${header}.${payload}.${base64url(signer.sign(account.privateKey))}`;
}

const tokenCache = new Map<string, { value: string; expiresAt: number }>();

/** Сбросить кэш токенов. Нужен прогонам — иначе они видят чужое состояние. */
export function resetServiceAccountTokenCache(): void {
  tokenCache.clear();
}

export async function serviceAccountAccessToken(input: {
  account: GoogleServiceAccount;
  fetchImpl?: typeof fetch;
  now?: number;
}): Promise<string> {
  const now = input.now ?? Date.now();
  const fetchImpl = input.fetchImpl ?? fetch;
  const cacheKey = input.account.clientEmail;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt - TOKEN_SAFETY_MS > now) return cached.value;

  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signServiceAccountJwt(input.account, now),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    // ⚠ Тело ответа наружу не отдаём: в нём эхо запроса вместе с подписью.
    throw new Error(`Vertex token exchange failed: HTTP ${response.status}`);
  }
  const payload = await response.json() as { access_token?: string; expires_in?: number };
  if (!payload.access_token) throw new Error("Vertex token exchange returned no token");
  tokenCache.set(cacheKey, {
    value: payload.access_token,
    expiresAt: now + (payload.expires_in ?? 3600) * 1000,
  });
  return payload.access_token;
}
