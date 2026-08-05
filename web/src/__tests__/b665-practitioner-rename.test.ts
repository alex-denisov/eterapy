/**
 * B665 — демо-профиль стал реальным практиком.
 *
 * Владелец 2026-08-05: «Елена Морозова» переименована в «Алису Бабаеву» —
 * живого человека, — адрес профиля меняется вместе с именем, ссылки заменяются
 * без переадресации.
 *
 * Отдельная и более важная проверка — витринные данные. У демо-профиля были
 * рейтинг, 15 отзывов и 120 проведённых сессий. Под демо-именем это витрина;
 * под именем конкретного живого специалиста это сфабрикованные отзывы о
 * человеке. Тест сторожит именно это: переименовать, не унеся с собой выдумку.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { practitioners } from "@/data/practitioners";

const MIGRATION = join(
  process.cwd(),
  "prisma/migrations/20260805090000_b665_practitioner_rename_alisa_babaeva/migration.sql",
);

describe("B665 · переименование профиля", () => {
  const alisa = practitioners.find((row) => row.id === "alisa-babaeva");

  it("старого адреса профиля не осталось нигде в каталоге", () => {
    expect(practitioners.some((row) => row.id === "elena-morozova")).toBe(false);
    expect(practitioners.some((row) => row.name.includes("Морозова"))).toBe(false);
  });

  it("адрес соответствует имени и фамилии", () => {
    expect(alisa).toBeDefined();
    expect(alisa?.name).toBe("Алиса Бабаева");
  });

  it("специализации — таро, астрология и нумерология", () => {
    expect(alisa?.specialties).toEqual(
      expect.arrayContaining(["tarot", "astrology", "numerology"]),
    );
  });

  it("у живого человека нет выдуманных отзывов и счётчиков", () => {
    expect(alisa?.reviews).toEqual([]);
    expect(alisa?.reviewCount).toBe(0);
    expect(alisa?.sessionCount).toBe(0);
    expect(alisa?.rating).toBe(0);
  });
});

describe("B665 · миграция переносит то же самое в базу", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("меняет адрес профиля и имя пользователя", () => {
    expect(sql).toContain("slug = 'alisa-babaeva'");
    expect(sql).toContain("name = 'Алиса Бабаева'");
  });

  it("удаляет выдуманные отзывы и обнуляет счётчики", () => {
    expect(sql).toMatch(/DELETE FROM reviews/i);
    expect(sql).toContain('"reviewCount" = 0');
    expect(sql).toContain('"sessionCount" = 0');
    expect(sql).toContain('"ratingSum" = 0');
  });

  it("обновляет taxonomy-колонки, по которым фильтрует каталог", () => {
    // Замер прода: каталог фильтрует по `directions`, а не по `specialties`.
    // Без этой строки практик не нашёлся бы по фильтру «Таро».
    expect(sql).toContain("directions = ARRAY['tarot', 'astrology', 'numerology']");
  });

  it("не трогает закрытость профиля для записи", () => {
    // Владелец 2026-08-05: «пока пользователей нет — нет смысла её онбордить».
    // Открытие записи — отдельное решение, не побочный эффект переименования.
    expect(sql).not.toMatch(/demo_account\s*=/);
  });
});
