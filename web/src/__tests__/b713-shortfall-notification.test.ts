/**
 * B713 §5 — «выпускать нечего» обязано быть слышно в маркетинговом канале.
 *
 * Требование владельца 2026-08-17: в канал идут уведомления о публикациях на
 * всех площадках, «кроме reddit который не подключен», плюс «сообщения о том
 * что нет материалов для выпуска (исчерпание емкости, ошибки которые
 * препятствуют готовящемуся выпуску материала)».
 *
 * Проверяется ЧИСТАЯ функция: содержимое карточки — предмет прогона, а не
 * живой отправки в Telegram.
 */

import {
  buildShortfallNotification,
  platformIsSilent,
  shortfallWorthReporting,
  type ShortfallInput,
} from "@/lib/marketing/shortfall-notification";

function input(over: Partial<ShortfallInput> = {}): ShortfallInput {
  return {
    plannedSlots: 6,
    published: 1,
    causes: [
      { platform: "telegram", reason: "раунды редактуры не сошлись", count: 3 },
      { platform: "threads", reason: "превышен лимит площадки", count: 1 },
    ],
    capacityExhausted: [],
    since: new Date("2026-08-16T21:00:00Z"),
    until: new Date("2026-08-17T21:00:00Z"),
    ...over,
  };
}

describe("B713 — сводка «нет материала для выпуска»", () => {
  it("называет план, выпуск и незакрытые слоты", () => {
    const text = buildShortfallNotification(input());
    expect(text).toContain("Слотов в плане:</b> 6");
    expect(text).toContain("Вышло:</b> 1");
    expect(text).toContain("Не закрыто слотов:</b> 5");
  });

  it("перечисляет причины по убыванию числа задетых материалов", () => {
    const text = buildShortfallNotification(input());
    expect(text.indexOf("раунды редактуры")).toBeLessThan(text.indexOf("лимит площадки"));
  });

  it("называет исчерпание ёмкости отдельно от брака материала", () => {
    const text = buildShortfallNotification(input({ capacityExhausted: ["telegram", "vk"] }));
    expect(text).toContain("Исчерпана ёмкость моделей");
    expect(text).toContain("не написан, а не забракован");
  });
});

describe("B713 — Reddit не шумит: площадка не подключена", () => {
  it("объявлен молчащим", () => {
    expect(platformIsSilent("reddit")).toBe(true);
    expect(platformIsSilent("Reddit")).toBe(true);
    expect(platformIsSilent("telegram")).toBe(false);
  });

  it("отказ Reddit не попадает в сводку", () => {
    const text = buildShortfallNotification(input({
      causes: [
        { platform: "reddit", reason: "Reddit OAuth is not connected", count: 9 },
        { platform: "telegram", reason: "раунды редактуры не сошлись", count: 2 },
      ],
    }));
    expect(text).not.toContain("OAuth");
    expect(text).toContain("раунды редактуры");
  });

  it("сводка не отправляется, если ВСЁ, что мешало, — это Reddit", () => {
    expect(shortfallWorthReporting(input({
      causes: [{ platform: "reddit", reason: "не подключено", count: 9 }],
      capacityExhausted: ["reddit"],
    }))).toBe(false);
  });
});

describe("B713 — молчим, когда сообщать не о чем", () => {
  it("план закрыт целиком — сводки нет", () => {
    expect(shortfallWorthReporting(input({
      plannedSlots: 3,
      published: 3,
      causes: [],
      capacityExhausted: [],
    }))).toBe(false);
  });

  it("слоты не закрыты и причина живая — сводка нужна", () => {
    expect(shortfallWorthReporting(input())).toBe(true);
  });
});
