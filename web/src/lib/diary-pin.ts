// B369 (M26): опциональный device-level PIN Дневника.
//
// Это замок устройства, а не серверная граница безопасности: PIN хранится
// только в localStorage этого браузера (соль + SHA-256), никогда не уходит на
// сервер, не запрашивается в письмах или чате и не заменяет пароль аккаунта.
// Клиент-безопасный модуль без db — используется client-компонентом гейта.

export const DIARY_PIN_INACTIVITY_MS = 15 * 60 * 1000;

export const DIARY_PIN_STORAGE_KEY = "eterapy.diary.pin.v1";
export const DIARY_PIN_UNLOCK_KEY = "eterapy.diary.unlockedAt.v1";

// B464 round-4 #8: the sidebar lock mirrors the PIN state live. Every surface
// that sets or removes the PIN dispatches this window event after writing
// localStorage (the native `storage` event only fires in OTHER tabs).
export const DIARY_PIN_CHANGED_EVENT = "eterapy:diary-pin-changed";

export function notifyDiaryPinChanged(): void {
  try {
    window.dispatchEvent(new Event(DIARY_PIN_CHANGED_EVENT));
  } catch {
    /* non-browser or CustomEvent unavailable — sidebar just reads on next mount */
  }
}

export function hasDiaryPinStored(): boolean {
  try {
    return Boolean(localStorage.getItem(DIARY_PIN_STORAGE_KEY));
  } catch {
    return false;
  }
}

export type DiaryPinRecord = {
  saltHex: string;
  hashHex: string;
};

export function isValidDiaryPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return bytesToHex(new Uint8Array(digest));
}

export async function hashDiaryPin(pin: string): Promise<DiaryPinRecord> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const saltHex = bytesToHex(salt);
  return { saltHex, hashHex: await sha256Hex(`${saltHex}:${pin}`) };
}

export async function verifyDiaryPin(pin: string, record: DiaryPinRecord): Promise<boolean> {
  return (await sha256Hex(`${record.saltHex}:${pin}`)) === record.hashHex;
}

/**
 * Лочим, если метки разблокировки нет, она старше таймаута неактивности или
 * стоит в будущем (сбитые часы — безопаснее запросить PIN ещё раз).
 */
export function shouldLockDiary(
  lastActiveAt: number | null,
  now: number,
  timeoutMs: number = DIARY_PIN_INACTIVITY_MS,
): boolean {
  if (lastActiveAt === null || !Number.isFinite(lastActiveAt)) return true;
  if (lastActiveAt > now) return true;
  return now - lastActiveAt > timeoutMs;
}

export function serializeDiaryPinRecord(record: DiaryPinRecord): string {
  return JSON.stringify(record);
}

export function parseDiaryPinRecord(raw: string | null): DiaryPinRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DiaryPinRecord>;
    if (
      typeof parsed.saltHex === "string" && /^[0-9a-f]{32}$/.test(parsed.saltHex) &&
      typeof parsed.hashHex === "string" && /^[0-9a-f]{64}$/.test(parsed.hashHex)
    ) {
      return { saltHex: parsed.saltHex, hashHex: parsed.hashHex };
    }
    return null;
  } catch {
    return null;
  }
}
