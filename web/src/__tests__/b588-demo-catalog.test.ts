/**
 * B588 (owner 2026-07-26) — «Каталог демо-профилей: оставляем только по 2 профилю
 * каждого направления (эзотерика и психология), остальные отключаем».
 *
 * Тест держит три вещи, каждая из которых молча откатила бы решение владельца:
 *   1. список оставленных профилей — ровно два на направление;
 *   2. миграция гасит именно тех, кого нет в списке (списки в SQL и в модуле
 *      обязаны совпадать — SQL не может импортировать TypeScript);
 *   3. сиды не создают демо-профили безусловно активными, с принудительно
 *      открытой записью и включённым расписанием. Именно этот класс дефекта
 *      B584 оставил: он погасил данные миграцией, а сид продолжал ставить
 *      `status: ACTIVE` + `bookingOverrideEnabled: true` + `enabled: true`, то
 *      есть повторный прогон вернул бы всё как было.
 */
import fs from "node:fs";
import path from "node:path";
import {
  DEMO_ACCOUNT_EMAIL_SUFFIX,
  KEPT_DEMO_PROFILES,
  KEPT_DEMO_PROFILES_PER_DIRECTION,
  demoSeedPractitionerStatus,
  isDemoAccountEmail,
  isKeptDemoProfile,
} from "@/lib/demo-catalog";

const MIGRATION = path.join(
  process.cwd(),
  "prisma",
  "migrations",
  "20260726190000_b588_demo_catalog_two_per_direction",
  "migration.sql",
);

const SEEDS = [
  path.join(process.cwd(), "prisma", "seed.ts"),
  path.join(process.cwd(), "prisma", "seed-psy-coach-practitioners.ts"),
];

/** Все демо-профили, которые сиды вообще создают (по почте). */
const ALL_DEMO_EMAILS = [
  "practitioner@test.eterapy.com",
  "tarot@test.eterapy.com",
  "astrology@test.eterapy.com",
  "numerology@test.eterapy.com",
  "psychic@test.eterapy.com",
  "runes@test.eterapy.com",
  "dreams@test.eterapy.com",
  "psy-cbt@test.eterapy.com",
  "psy-family@test.eterapy.com",
  "psy-gestalt@test.eterapy.com",
  "psy-emdr@test.eterapy.com",
  "coach-life@test.eterapy.com",
  "coach-career@test.eterapy.com",
];

describe("B588 — список оставленных демо-профилей", () => {
  it("ровно два профиля на каждое из двух направлений", () => {
    expect(KEPT_DEMO_PROFILES).toHaveLength(2 * KEPT_DEMO_PROFILES_PER_DIRECTION);
    for (const direction of ["esoteric", "psychology"] as const) {
      const kept = KEPT_DEMO_PROFILES.filter((profile) => profile.direction === direction);
      expect(kept).toHaveLength(KEPT_DEMO_PROFILES_PER_DIRECTION);
    }
  });

  it("коучинг в каталоге не остаётся — владелец назвал два направления", () => {
    const directions = new Set(KEPT_DEMO_PROFILES.map((profile) => profile.direction));
    expect([...directions].sort()).toEqual(["esoteric", "psychology"]);
  });

  it("у каждого оставленного профиля указана причина", () => {
    for (const profile of KEPT_DEMO_PROFILES) {
      expect(profile.why.length).toBeGreaterThan(10);
      expect(profile.email.endsWith(DEMO_ACCOUNT_EMAIL_SUFFIX)).toBe(true);
    }
  });

  it("девять профилей из тринадцати отключаются", () => {
    const suspended = ALL_DEMO_EMAILS.filter((email) => !isKeptDemoProfile(email));
    expect(suspended).toHaveLength(9);
    expect(suspended).toContain("psy-gestalt@test.eterapy.com");
    expect(suspended).toContain("coach-career@test.eterapy.com");
    expect(suspended).toContain("runes@test.eterapy.com");
  });

  it("статус для сида: активны только оставленные", () => {
    expect(demoSeedPractitionerStatus("tarot@test.eterapy.com")).toBe("ACTIVE");
    expect(demoSeedPractitionerStatus("runes@test.eterapy.com")).toBe("SUSPENDED");
    // Живой практик (не демо-домен) статус от этого правила не получает.
    expect(demoSeedPractitionerStatus("real@example.com")).toBe("ACTIVE");
    expect(isDemoAccountEmail("real@example.com")).toBe(false);
    expect(isDemoAccountEmail("Runes@Test.Eterapy.Com")).toBe(true);
  });
});

describe("B588 — миграция совпадает со списком в коде", () => {
  const sql = fs.readFileSync(MIGRATION, "utf8");

  it("гасит только демо-аккаунты и только активные", () => {
    expect(sql).toContain(`SET "status" = 'SUSPENDED'`);
    expect(sql).toContain(`p."demo_account" = true`);
    expect(sql).toContain(`p."status" = 'ACTIVE'`);
  });

  it("список исключений в SQL — ровно те же четыре почты", () => {
    for (const profile of KEPT_DEMO_PROFILES) {
      expect(sql).toContain(`'${profile.email}'`);
    }
    const quoted = sql.match(/'[a-z0-9-]+@test\.eterapy\.com'/g) ?? [];
    expect(new Set(quoted).size).toBe(KEPT_DEMO_PROFILES.length);
  });
});

describe("B588 — сиды не воскрешают отключённые профили", () => {
  for (const seed of SEEDS) {
    const name = path.basename(seed);
    const source = fs.readFileSync(seed, "utf8");

    it(`${name}: статус берётся из demo-catalog, а не захардкожен`, () => {
      expect(source).toContain("demoSeedPractitionerStatus");
      expect(source).not.toMatch(/status:\s*"ACTIVE"/);
      expect(source).not.toMatch(/status:\s*PractitionerStatus\.ACTIVE\s*,/);
    });

    it(`${name}: демо-профиль помечается флагом demoAccount`, () => {
      expect(source).toContain("demoAccount: isDemoAccountEmail(");
    });

    it(`${name}: запись демо-профилю принудительно не открывается`, () => {
      expect(source).toContain("bookingOverrideEnabled: false");
      expect(source).not.toMatch(/bookingOverrideEnabled:\s*true/);
    });

    it(`${name}: расписание демо-профиля создаётся выключенным`, () => {
      // Флаг правила должен приходить из выражения, а не быть литералом. Смотрим
      // окно после каждого вызова scheduleRule — тарифы (`priceRate`) с
      // `enabled: true` живут в другом месте файла и в это окно не попадают.
      const windows = [...source.matchAll(/scheduleRule/g)].map((match) =>
        source.slice(match.index ?? 0, (match.index ?? 0) + 600),
      );
      expect(windows.length).toBeGreaterThan(0);
      for (const window of windows) {
        expect(window).not.toMatch(/enabled:\s*true/);
        expect(window).toMatch(/enabled:\s*(scheduleEnabled|!isDemoAccountEmail\()/);
      }
    });
  }
});
