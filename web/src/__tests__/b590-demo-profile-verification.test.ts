/**
 * B590 (owner 2026-07-26) — «мы не меняем механику проверок для ненастоящих
 * специалистов, но для тех что остались на платформе нужно поставить все
 * признаки прохождения проверки, пусть будут как специалисты, но пока без
 * доступных окон записи».
 *
 * Тест держит четыре вещи:
 *   1. признак проверки полный — `verified` всегда идёт вместе с `verifiedAt`;
 *   2. отключённые B588 профили признак НЕ несут;
 *   3. сиды берут признак из модуля, а не хардкодят — иначе повторный прогон
 *      (на стенде он идёт после каждой синхронизации БД) откатил бы решение;
 *   4. налоговый статус и реквизиты выплат НЕ выдумываются: они печатаются на
 *      публичной странице как утверждение о конкретном человеке.
 */
import fs from "node:fs";
import path from "node:path";
import {
  DEMO_PROFILE_VERIFIED_AT,
  KEPT_DEMO_PROFILES,
  demoSeedPractitionerVerified,
} from "@/lib/demo-catalog";

const MIGRATION = path.join(
  process.cwd(),
  "prisma",
  "migrations",
  "20260726210000_b590_demo_profile_verification_marks",
  "migration.sql",
);

const SEEDS = [
  path.join(process.cwd(), "prisma", "seed.ts"),
  path.join(process.cwd(), "prisma", "seed-psy-coach-practitioners.ts"),
];

const SUSPENDED_DEMO_EMAILS = [
  "astrology@test.eterapy.com",
  "numerology@test.eterapy.com",
  "psychic@test.eterapy.com",
  "runes@test.eterapy.com",
  "dreams@test.eterapy.com",
  "psy-gestalt@test.eterapy.com",
  "psy-emdr@test.eterapy.com",
  "coach-career@test.eterapy.com",
  "coach-life@test.eterapy.com",
];

describe("B590 · признак проверки у оставленных демо-профилей", () => {
  it("все четыре оставленных профиля помечены проверенными", () => {
    for (const profile of KEPT_DEMO_PROFILES) {
      expect(demoSeedPractitionerVerified(profile.email)).toBe(true);
    }
  });

  it("отключённые профили признак проверки не несут", () => {
    for (const email of SUSPENDED_DEMO_EMAILS) {
      expect(demoSeedPractitionerVerified(email)).toBe(false);
    }
  });

  it("живой (не демо) аккаунт признак получает не отсюда", () => {
    // Реальный специалист проходит проверку в суперадминке; сид его не трогает.
    expect(demoSeedPractitionerVerified("someone@gmail.com")).toBe(false);
    expect(demoSeedPractitionerVerified(null)).toBe(false);
  });

  it("дата проверки фиксированная — идемпотентный сид не плодит диф", () => {
    expect(DEMO_PROFILE_VERIFIED_AT.toISOString()).toBe("2026-07-26T00:00:00.000Z");
  });
});

describe("B590 · миграция", () => {
  const sql = fs.readFileSync(MIGRATION, "utf8");

  it("ставит признак ровно оставленным четырём профилям", () => {
    for (const profile of KEPT_DEMO_PROFILES) {
      expect(sql).toContain(profile.email);
    }
    expect(sql).toContain('SET "verified" = true');
  });

  it("снимает признак с отключённых демо-профилей", () => {
    expect(sql).toContain('SET "verified" = false');
    expect(sql).toContain('"demo_account" = true');
  });

  it("не выдумывает налоговый статус, ИНН и реквизиты выплат", () => {
    // Эти поля печатаются на публичной странице строкой «Статус: … · ИНН …».
    expect(sql).not.toMatch(/SET[^;]*"tax_status"\s*=/i);
    expect(sql).not.toMatch(/SET[^;]*"tax_review_status"\s*=/i);
    expect(sql).not.toMatch(/SET[^;]*"inn"\s*=/i);
    expect(sql).not.toMatch(/SET[^;]*"agent_offer_accepted_at"\s*=/i);
  });

  it("запись остаётся закрытой: флаг demo_account не снимается", () => {
    expect(sql).not.toMatch(/SET[^;]*"demo_account"\s*=\s*false/i);
  });
});

describe("B590 · сиды не откатывают решение", () => {
  it.each(SEEDS)("%s берёт признак проверки из модуля, а не хардкодом", (seed) => {
    const src = fs.readFileSync(seed, "utf8");
    expect(src).toContain("demoSeedPractitionerVerified");
    // `verified: true` безусловно вернуло бы признак отключённым профилям
    expect(src).not.toMatch(/verified:\s*true/);
    // «verified без verifiedAt» — половина признака, ровно это и было на проде
    expect(src).toContain("verifiedAt");
  });
});
