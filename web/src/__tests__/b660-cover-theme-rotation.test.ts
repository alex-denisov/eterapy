/**
 * B660 — обложки соседних выпусков не должны совпадать.
 *
 * Первая версия брала хеш ключа. По корпусу палитры раскладывались ровно, но на
 * стенде три идущих подряд материала (Дзен 06:30, Telegram 05:30, Instagram)
 * получили одну и ту же зелёную. Владелец смотрит на ленту, а не на
 * распределение, и там «случайно ровно» читается как «одинаково».
 *
 * Сторожим именно свойство ленты: два соседних слота канала — разные палитры.
 */

import { coverThemeIndex } from "@/lib/marketing/cover-theme";

const at = (iso: string) => new Date(iso);

describe("B660 · вращение палитры обложек", () => {
  it("соседние слоты одного канала получают разные палитры", () => {
    const morning = coverThemeIndex({
      key: "b610-2w-telegram-20260805-01",
      platform: "telegram",
      scheduledFor: at("2026-08-05T05:30:00+03:00"),
    });
    const day = coverThemeIndex({
      key: "b610-2w-telegram-20260805-02",
      platform: "telegram",
      scheduledFor: at("2026-08-05T10:00:00+03:00"),
    });
    const evening = coverThemeIndex({
      key: "b610-2w-telegram-20260805-03",
      platform: "telegram",
      scheduledFor: at("2026-08-05T19:00:00+03:00"),
    });

    expect(new Set([morning, day, evening]).size).toBe(3);
  });

  it("два канала в одном окне не совпадают между собой", () => {
    const slot = at("2026-08-05T06:30:00+03:00");
    const dzen = coverThemeIndex({ key: "a", platform: "dzen", scheduledFor: slot });
    const telegram = coverThemeIndex({ key: "b", platform: "telegram", scheduledFor: slot });

    expect(dzen).not.toBe(telegram);
  });

  it("один и тот же материал всегда отдаёт одну и ту же палитру", () => {
    // Площадки перезапрашивают обложку; «мигающая» картинка читается как подмена.
    const input = {
      key: "b610-2w-vk-20260805-01",
      platform: "vk",
      scheduledFor: at("2026-08-05T12:00:00+03:00"),
    };
    expect(coverThemeIndex(input)).toBe(coverThemeIndex(input));
  });

  it("без даты выпуска палитра всё равно определена и стабильна", () => {
    const input = { key: "b610-2w-vk-draft", platform: "vk", scheduledFor: null };
    const value = coverThemeIndex(input);
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(coverThemeIndex(input)).toBe(value);
  });

  it("недельная лента канала перебирает все шесть палитр", () => {
    const indexes = new Set<number>();
    for (let day = 1; day <= 7; day += 1) {
      for (const hour of [5, 10, 19]) {
        indexes.add(coverThemeIndex({
          key: `b610-2w-dzen-2026080${day}-${hour}`,
          platform: "dzen",
          scheduledFor: at(`2026-08-0${day}T${String(hour).padStart(2, "0")}:30:00+03:00`),
        }));
      }
    }
    expect(indexes.size).toBe(6);
  });
});
