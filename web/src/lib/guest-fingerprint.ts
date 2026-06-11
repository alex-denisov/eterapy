// B372 (M26): лёгкий собственный клиентский отпечаток (sha-256 от
// UA+canvas+TZ+экрана, без внешних сервисов). Клиент кладёт его в cookie
// `eterapy_fp`; сервер использует для гостевого лимита 1 разбор/мес и
// антифрод-логов. Отпечаток клиент-контролируемый — это сигнал, не граница
// безопасности; жёсткие границы остаются за IP rate-limit'ами.

import type { NextRequest } from "next/server";

export const CLIENT_FINGERPRINT_COOKIE = "eterapy_fp";
export const CLIENT_FINGERPRINT_HEADER = "x-eterapy-fp";

export function isValidClientFingerprint(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

export function readClientFingerprint(request: NextRequest): string | null {
  const header = request.headers.get(CLIENT_FINGERPRINT_HEADER);
  if (isValidClientFingerprint(header)) return header;
  const cookie = request.cookies?.get(CLIENT_FINGERPRINT_COOKIE)?.value ?? null;
  return isValidClientFingerprint(cookie) ? cookie : null;
}

/** Гостевой лимит считается календарным месяцем UTC. */
export function startOfDialogueLimitMonth(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
