/**
 * B676 · Алиса Бабаева — полноценный специалист; одна цена сессии у остальных.
 *
 * Проверяется ровно то, что нельзя увидеть глазами на витрине: миграция и гейт
 * даты. Готча, ради которой тест написан: расписание в системе — НЕДЕЛЬНЫЕ
 * правила без дат, поэтому «принимаю с 10 сентября» не выражается ни правилом,
 * ни блокировкой, и любой будущий рефактор доступности легко потеряет гейт.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { practitioners } from "@/data/practitioners";

const ROOT = join(__dirname, "..", "..");
const MIGRATION = join(
  ROOT,
  "prisma/migrations/20260805150000_b676_alisa_onboarding_and_session_prices/migration.sql",
);

const sql = readFileSync(MIGRATION, "utf8");
const HOURS_MIGRATION = join(
  ROOT,
  "prisma/migrations/20260805170000_b676_alisa_schedule_hours_msk/migration.sql",
);
const hoursSql = readFileSync(HOURS_MIGRATION, "utf8");
const source = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("B676 · миграция", () => {
  it("заводит колонку даты открытия записи и не падает на повторном прогоне", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS bookable_from/i);
  });

  it("открывает запись Алисе с 10 сентября 2026 по московскому времени", () => {
    // 00:00 MSK = 21:00 UTC предыдущего дня. Значение в UTC, потому что колонка
    // без часового пояса — местное время здесь превратилось бы в 03:00.
    expect(sql).toContain("bookable_from = TIMESTAMP '2026-09-09 21:00:00'");
  });

  it("снимает с неё демо-флаг — иначе слоты не отдаются вовсе (B584)", () => {
    expect(sql).toMatch(/demo_account = false/);
  });

  it("цена: 10 000 ₽ у Алисы, 9 000 ₽ у остальных, всегда 60 минут", () => {
    expect(sql).toMatch(/"pricePerSession" = 9000,\s*\n\s*"sessionDuration" = 60/);
    expect(sql).toContain('"pricePerSession" = 10000');
    expect(sql).not.toMatch(/"sessionDuration" = 45/);
  });

  it("возвращает 15 отзывов и НЕ вставляет их без своего бронирования", () => {
    const rows = sql.match(/seed_rv_cmo2tqzmf00005iwk10hqp8hg_\d+/g) ?? [];
    expect(new Set(rows).size).toBe(15);
    expect(sql).toMatch(/EXISTS \(SELECT 1 FROM bookings b WHERE b\.id = v\."bookingId"\)/);
    expect(sql).toMatch(/ON CONFLICT \(id\) DO NOTHING/);
  });

  it("счётчики считаются из строк, а не проставляются числом", () => {
    // Прежние 120 сессий были выдумкой; после B676 витрина показывает то, что
    // реально лежит в базе, иначе она снова врёт про живого человека.
    expect(sql).toMatch(/sum\(r\.rating\)/);
    expect(sql).not.toMatch(/"sessionCount" = 120/);
  });

  it("часы расписания хранятся в UTC и означают 10:00–19:00 MSK", () => {
    // Готча, найденная живой проверкой стенда: слот строится из строки без
    // суффикса зоны, контейнер живёт в UTC, клиент печатает время в зоне
    // браузера. Правило «10–19» давало москвичу 13:00–22:00.
    expect(hoursSql).toMatch(/"startHour" = 7, "endHour" = 16/);
    expect(hoursSql).toMatch(/slug = 'alisa-babaeva'/);
  });

  it("заводит недельное расписание, включая явно выключенные выходные", () => {
    expect(sql).toMatch(/INSERT INTO schedule_rules/);
    expect(sql).toMatch(/generate_series\(1, 5\)/);
    expect(sql).toMatch(/unnest\(ARRAY\[0, 6\]\)/);
  });
});

describe("B676 · гейт даты в выдаче доступности", () => {
  it("оба маршрута слотов спрашивают дату открытия записи", () => {
    const available = source("src/app/api/slots/available/route.ts");
    const month = source("src/app/api/slots/month/route.ts");
    expect(available).toContain("getPractitionerBookableFrom");
    expect(month).toContain("getPractitionerBookableFrom");
  });

  it("дневная выдача отбрасывает слоты раньше даты открытия", () => {
    const available = source("src/app/api/slots/available/route.ts");
    expect(available).toMatch(/if \(bookableFrom && slot\.startAt < bookableFrom\) return false;/);
  });

  it("месячная выдача поднимает «сейчас», а не фильтрует дни отдельно", () => {
    // Отдельный фильтр по дням протёк бы через одноразовые TimeSlot: в
    // `dayHasAvailability` они дают доступность раньше проверки правил.
    const month = source("src/app/api/slots/month/route.ts");
    expect(month).toMatch(/const now = bookableFrom && bookableFrom > wallClock \? bookableFrom : wallClock;/);
  });
});

describe("B676 · витрина каталога", () => {
  const alisa = practitioners.find((row) => row.id === "alisa-babaeva");

  it("у Алисы час стоит 10 000 ₽", () => {
    expect(alisa?.pricePerSession).toBe(10000);
  });

  it("у всех остальных — 9 000 ₽ и ни одного другого значения", () => {
    const others = practitioners.filter((row) => row.id !== "alisa-babaeva");
    expect(others.length).toBeGreaterThan(0);
    expect(new Set(others.map((row) => row.pricePerSession))).toEqual(new Set([9000]));
  });

  it("слоты открыты только у Алисы — остальным `nextSlot` не обещает записи", () => {
    // Владелец 2026-08-05: «Остальным всем практикам… не открывай слоты».
    const others = practitioners.filter((row) => row.id !== "alisa-babaeva");
    expect(others.every((row) => row.nextSlot === null)).toBe(true);
  });
});
