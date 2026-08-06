/**
 * B678 — «карта дня» Таро.
 *
 * Прогон закрывает ровно те свойства, поломка которых не видна ни в интерфейсе,
 * ни в логе: детерминированность выбора, границу МСК-суток, час рассылки в
 * будни и выходные и то, что карта дня НИКОГДА не приходит пустой.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import {
  fallbackTarotDayInterpretation,
  mskDayKey,
  mskWeekday,
  parseTarotDayInterpretation,
  tarotCardArtworkPath,
  tarotDayKey,
  tarotDayDueHourMsk,
  tarotDayPick,
  tarotDayPickFromKey,
} from "@/lib/tarot-day";
import { TAROT_DECK } from "@/lib/tarot-deck";

describe("B678 · выбор карты дня", () => {
  it("детерминирован для пары «человек + МСК-дата»", () => {
    const now = new Date("2026-08-05T09:00:00Z");
    const first = tarotDayPick("user-1", now);
    const second = tarotDayPick("user-1", new Date("2026-08-05T20:00:00Z"));
    expect(second.key).toBe(first.key);
    expect(second.card.code).toBe(first.card.code);
    expect(second.dayKey).toBe("2026-08-05");
  });

  it("у разных людей в один день карты расходятся", () => {
    const now = new Date("2026-08-05T09:00:00Z");
    const keys = new Set(
      Array.from({ length: 40 }, (_, index) => tarotDayPick(`user-${index}`, now).key),
    );
    // 40 человек на 156 вариантов: совпадения нормальны, но одна карта на всех
    // означала бы, что персонализации нет вовсе.
    expect(keys.size).toBeGreaterThan(10);
  });

  it("МСК-сутки меняются в 21:00 UTC, а не в полночь UTC", () => {
    // 20:59 UTC — это ещё 23:59 МСК того же дня.
    expect(mskDayKey(new Date("2026-08-05T20:59:00Z"))).toBe("2026-08-05");
    // 21:00 UTC — уже 00:00 МСК следующего дня.
    expect(mskDayKey(new Date("2026-08-05T21:00:00Z"))).toBe("2026-08-06");
    // Сама карта в полночь НЕ меняется — рубеж у неё в 07:00/09:00 МСК
    // (B684, `b684-tarot-day-schedule.test.ts`).
    expect(tarotDayPick("user-1", new Date("2026-08-05T21:00:00Z")).dayKey).toBe("2026-08-05");
  });

  it("ключ разбирается обратно в карту и положение", () => {
    for (const card of [TAROT_DECK[0], TAROT_DECK[30], TAROT_DECK[TAROT_DECK.length - 1]]) {
      for (const suffix of ["up", "rev"] as const) {
        const parsed = tarotDayPickFromKey(`${card.code}-${suffix}`);
        expect(parsed?.card.code).toBe(card.code);
        expect(parsed?.reversed).toBe(suffix === "rev");
      }
    }
    expect(tarotDayPickFromKey("не-карта")).toBeNull();
    expect(tarotDayPickFromKey("major-00")).toBeNull();
  });

  it("у каждой карты колоды есть свой скан НА ДИСКЕ", () => {
    const paths = TAROT_DECK.map((card) => tarotCardArtworkPath(card));
    expect(TAROT_DECK).toHaveLength(78);
    // 78 карт — 78 разных файлов: любая коллизия означала бы, что двум картам
    // достался один рисунок.
    expect(new Set(paths).size).toBe(78);
    // Проверяем существование файла, а не форму строки: собранный путь,
    // которому ничего не соответствует, даёт 404 у картинки в письме и пустое
    // место в кабинете — сборка при этом зелёная
    // (`feedback_gitignore_swallows_assets`).
    const missing = paths.filter((value) => !existsSync(path.join(process.cwd(), "public", value)));
    expect(missing).toEqual([]);
  });
});

describe("B678 · час рассылки по МСК", () => {
  it("в будни 07:00, в выходные 09:00", () => {
    // 2026-08-05 — среда, 2026-08-08 — суббота, 2026-08-09 — воскресенье.
    expect(mskWeekday(new Date("2026-08-05T09:00:00Z"))).toBe(3);
    expect(tarotDayDueHourMsk(new Date("2026-08-05T09:00:00Z"))).toBe(7);
    expect(tarotDayDueHourMsk(new Date("2026-08-08T09:00:00Z"))).toBe(9);
    expect(tarotDayDueHourMsk(new Date("2026-08-09T09:00:00Z"))).toBe(9);
  });

  it("рубеж суток карты и есть час рассылки", () => {
    // B684: отдельного предиката «пора ли слать» больше нет — расписание живёт
    // в одном месте, в ключе суток карты. Среда: 03:59 UTC = 06:59 МСК — ключ
    // ещё вчерашний, значит вчерашняя рассылка уже отмечена и новой не будет.
    expect(tarotDayKey(new Date("2026-08-05T03:59:00Z"))).toBe("2026-08-04");
    expect(tarotDayKey(new Date("2026-08-05T04:00:00Z"))).toBe("2026-08-05");
    // Суббота, 04:00 UTC = 07:00 МСК: в будни это час отправки, в выходной нет.
    expect(tarotDayKey(new Date("2026-08-08T04:00:00Z"))).toBe("2026-08-07");
    expect(tarotDayKey(new Date("2026-08-08T06:00:00Z"))).toBe("2026-08-08");
  });
});

describe("B678 · трактовка", () => {
  it("детерминированный текст заполнен для КАЖДОЙ карты в обоих положениях", () => {
    for (const card of TAROT_DECK) {
      for (const reversed of [false, true]) {
        const text = fallbackTarotDayInterpretation({
          card,
          reversed,
          key: `${card.code}-${reversed ? "rev" : "up"}`,
          dayKey: "2026-08-05",
        });
        expect(text.headline.length).toBeGreaterThan(0);
        expect(text.body.length).toBeGreaterThan(20);
        expect(text.focus.length).toBeGreaterThan(0);
        expect(text.question.length).toBeGreaterThan(0);
      }
    }
  });

  it("неполный ответ модели отвергается целиком", () => {
    expect(parseTarotDayInterpretation({ headline: "Тише", body: "Текст", focus: "" })).toBeNull();
    expect(parseTarotDayInterpretation(null)).toBeNull();
    expect(parseTarotDayInterpretation("строка")).toBeNull();
    expect(
      parseTarotDayInterpretation({ headline: "Тише", body: "Текст", focus: "Фокус", question: "Вопрос?" }),
    ).toEqual({ headline: "Тише", body: "Текст", focus: "Фокус", question: "Вопрос?" });
  });
});
