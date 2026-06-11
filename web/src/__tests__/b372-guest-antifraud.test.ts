import { normalizeEmailForFraud, isGmailAlias } from "@/lib/email-normalize";
import { isValidClientFingerprint, startOfDialogueLimitMonth } from "@/lib/guest-fingerprint";

describe("B372 — нормализация email для антифрода gmail-дублей", () => {
  it("gmail: точки и +suffix в local part схлопываются, googlemail → gmail", () => {
    expect(normalizeEmailForFraud("a.b.c@gmail.com")).toBe("abc@gmail.com");
    expect(normalizeEmailForFraud("abc+spam@gmail.com")).toBe("abc@gmail.com");
    expect(normalizeEmailForFraud("A.B.c+x@GMAIL.com")).toBe("abc@gmail.com");
    expect(normalizeEmailForFraud("a.bc@googlemail.com")).toBe("abc@gmail.com");
  });

  it("не-gmail домены только приводятся к нижнему регистру (точки значимы)", () => {
    expect(normalizeEmailForFraud("A.B@yandex.ru")).toBe("a.b@yandex.ru");
    expect(normalizeEmailForFraud("user+tag@example.com")).toBe("user+tag@example.com");
  });

  it("isGmailAlias: дубль через точки/плюс детектится", () => {
    expect(isGmailAlias("a.b.c@gmail.com", "abc@gmail.com")).toBe(true);
    expect(isGmailAlias("abc+1@gmail.com", "abc@gmail.com")).toBe(true);
    expect(isGmailAlias("abc@gmail.com", "abd@gmail.com")).toBe(false);
    expect(isGmailAlias("a.b@yandex.ru", "ab@yandex.ru")).toBe(false);
  });

  it("мусорный ввод не роняет нормализацию", () => {
    expect(normalizeEmailForFraud("")).toBe("");
    expect(normalizeEmailForFraud("no-at-sign")).toBe("no-at-sign");
  });
});

describe("B372 — гостевой отпечаток и месячное окно", () => {
  it("валидирует 64-hex отпечаток", () => {
    expect(isValidClientFingerprint("a".repeat(64))).toBe(true);
    expect(isValidClientFingerprint("0123456789abcdef".repeat(4))).toBe(true);
    expect(isValidClientFingerprint("A".repeat(64))).toBe(false); // только нижний регистр
    expect(isValidClientFingerprint("a".repeat(63))).toBe(false);
    expect(isValidClientFingerprint("")).toBe(false);
    expect(isValidClientFingerprint(null)).toBe(false);
  });

  it("startOfDialogueLimitMonth — первое число месяца UTC", () => {
    expect(startOfDialogueLimitMonth(new Date("2026-06-11T23:59:59Z")).toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(startOfDialogueLimitMonth(new Date("2026-01-01T00:00:00Z")).toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});
