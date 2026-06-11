import { webcrypto } from "crypto";

// jsdom не даёт crypto.subtle — в браузере он есть всегда (secure context).
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
}

import {
  DIARY_PIN_INACTIVITY_MS,
  hashDiaryPin,
  isValidDiaryPin,
  parseDiaryPinRecord,
  serializeDiaryPinRecord,
  shouldLockDiary,
  verifyDiaryPin,
} from "@/lib/diary-pin";

describe("B369 — device-level PIN Дневника", () => {
  it("валидирует формат PIN: 4–6 цифр", () => {
    expect(isValidDiaryPin("1234")).toBe(true);
    expect(isValidDiaryPin("123456")).toBe(true);
    expect(isValidDiaryPin("123")).toBe(false);
    expect(isValidDiaryPin("1234567")).toBe(false);
    expect(isValidDiaryPin("12a4")).toBe(false);
    expect(isValidDiaryPin("")).toBe(false);
  });

  it("hash + verify: правильный PIN проходит, неправильный — нет", async () => {
    const record = await hashDiaryPin("4321");
    expect(record.saltHex).toMatch(/^[0-9a-f]{32}$/);
    expect(record.hashHex).toMatch(/^[0-9a-f]{64}$/);
    expect(await verifyDiaryPin("4321", record)).toBe(true);
    expect(await verifyDiaryPin("1234", record)).toBe(false);
  });

  it("одинаковый PIN с разными солями даёт разные хеши", async () => {
    const a = await hashDiaryPin("5555");
    const b = await hashDiaryPin("5555");
    expect(a.hashHex).not.toBe(b.hashHex);
  });

  it("shouldLockDiary: блокирует после 15 минут неактивности и при отсутствии метки", () => {
    const now = 1_000_000_000_000;
    expect(shouldLockDiary(null, now)).toBe(true);
    expect(shouldLockDiary(now - DIARY_PIN_INACTIVITY_MS + 1000, now)).toBe(false);
    expect(shouldLockDiary(now - DIARY_PIN_INACTIVITY_MS - 1, now)).toBe(true);
    expect(shouldLockDiary(now + 60_000, now)).toBe(true); // часы сбиты вперёд — лочим
  });

  it("serialize/parse записи переживают round-trip и отбрасывают мусор", async () => {
    const record = await hashDiaryPin("0000");
    const parsed = parseDiaryPinRecord(serializeDiaryPinRecord(record));
    expect(parsed).toEqual(record);
    expect(parseDiaryPinRecord("not-json")).toBeNull();
    expect(parseDiaryPinRecord(JSON.stringify({ saltHex: "zz" }))).toBeNull();
    expect(parseDiaryPinRecord(null)).toBeNull();
  });

  it("инактивность по умолчанию — 15 минут", () => {
    expect(DIARY_PIN_INACTIVITY_MS).toBe(15 * 60 * 1000);
  });
});
