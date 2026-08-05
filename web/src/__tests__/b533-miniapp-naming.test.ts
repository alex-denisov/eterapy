import fs from "node:fs";
import path from "node:path";

/**
 * B533 — нейминг мини-аппа.
 *
 * Владелец 2026-07-22: «оставляем твою рекомендацию как за мой выбор» —
 * B576 добавляет категорийный маркер ИИ в профиль бота для discovery, не
 * представляя автоматический сервис психологом или врачом.
 *
 * Тест держит две вещи, которые легко разъезжаются: имя в профиле бота и
 * заголовок самого мини-аппа, — и границу ответственности: слов «терапия»,
 * «лечение», «диагноз» в публичных текстах бота быть не должно.
 */
const root = process.cwd();
const telegram = fs.readFileSync(path.join(root, "src/lib/telegram.ts"), "utf8");
const layout = fs.readFileSync(path.join(root, "src/app/miniapp/layout.tsx"), "utf8");

describe("B533 — имя мини-аппа утверждено владельцем", () => {
  it("профиль бота называет бренд, формат и категорию", () => {
    expect(telegram).toContain('"ETerapy · ИИ-разбор"');
  });

  it("стенд отличим от боевого бота", () => {
    expect(telegram).toContain('"ETerapy · ИИ-разбор (Stage)"');
  });

  it("кнопка запуска и /start зовут одним глаголом", () => {
    const launches = telegram.match(/Понять, что дальше/g) ?? [];
    expect(launches.length).toBeGreaterThanOrEqual(2);
    expect(telegram).not.toContain("Разобрать вопрос");
  });

  it("заголовок мини-аппа называет полку, а не технологию", () => {
    expect(layout).toContain("ETerapy · Разбор");
    expect(layout).not.toContain("ETerapy Mini App");
  });

  it("публичные тексты бота не обещают лечение", () => {
    // Граница ответственности, а не стилистика: мы инструмент рефлексии.
    for (const forbidden of [/терапи[яию]/i, /лечени[ея]/i, /диагноз/i, /исцелени[ея]/i]) {
      expect(telegram).not.toMatch(forbidden);
    }
  });

  it("говорит про ИИ-чат и явно сохраняет границу с психологом", () => {
    expect(telegram).toContain("Анонимный ИИ-чат");
    expect(telegram).toContain("Не заменяет психолога");
  });
});
