/**
 * B713 §5 — «выпускать нечего» обязано быть слышно в маркетинговом канале.
 *
 * Требование владельца 2026-08-17: в канал идут уведомления о публикациях на
 * всех площадках, плюс «сообщения о том что нет материалов для выпуска
 * (исчерпание емкости, ошибки которые препятствуют готовящемуся выпуску
 * материала)».
 *
 * ⚠ B742 — ИСКЛЮЧЕНИЯ БОЛЬШЕ НЕТ. В требовании стояло «кроме reddit который не
 * подключен», и под него завёлся список молчащих площадок. Reddit убран из
 * контура решением владельца 2026-09-12; список опустел и удалён вместе с ним,
 * поэтому теперь в сводку попадает КАЖДАЯ причина — ровно то, что прогон ниже
 * и сторожит.
 *
 * Проверяется ЧИСТАЯ функция: содержимое карточки — предмет прогона, а не
 * живой отправки в Telegram.
 */

import {
  buildShortfallNotification,
  shortfallFingerprint,
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

describe("B742 — молчащих площадок больше нет: слышно каждый отказ", () => {
  it("ни одна причина не отсеивается по имени площадки", () => {
    const text = buildShortfallNotification(input({
      causes: [
        { platform: "dzen", reason: "браузерная сессия не авторизована", count: 9 },
        { platform: "telegram", reason: "раунды редактуры не сошлись", count: 2 },
      ],
    }));
    expect(text).toContain("браузерная сессия не авторизована");
    expect(text).toContain("раунды редактуры");
  });

  it("одной причины на одной площадке хватает, чтобы сводка ушла", () => {
    expect(shortfallWorthReporting(input({
      causes: [{ platform: "dzen", reason: "сессия просрочена", count: 9 }],
      capacityExhausted: ["dzen"],
    }))).toBe(true);
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

describe("B746 — один брак из пятнадцати сводкой не считается", () => {
  it("одна-две вставшие строки при живом конвейере — молчим", () => {
    // Замер прода 2026-09-15: два вставших материала за трое суток давали
    // «конвейеру не хватило материала» на каждом суточном такте.
    expect(shortfallWorthReporting(input({
      plannedSlots: 15,
      published: 14,
      causes: [{ platform: "threads", reason: "раунды редактуры не сошлись", count: 1 }],
      capacityExhausted: [],
    }))).toBe(false);
    expect(shortfallWorthReporting(input({
      plannedSlots: 15,
      published: 13,
      causes: [{ platform: "threads", reason: "раунды редактуры не сошлись", count: 2 }],
      capacityExhausted: [],
    }))).toBe(false);
  });

  it("три и больше при трети плана — сводка; исчерпанная ёмкость — всегда", () => {
    expect(shortfallWorthReporting(input({
      plannedSlots: 9,
      published: 6,
      causes: [{ platform: "telegram", reason: "раунды редактуры не сошлись", count: 3 }],
      capacityExhausted: [],
    }))).toBe(true);
    // Три из тридцати — не треть: молчим.
    expect(shortfallWorthReporting(input({
      plannedSlots: 30,
      published: 27,
      causes: [{ platform: "telegram", reason: "раунды редактуры не сошлись", count: 3 }],
      capacityExhausted: [],
    }))).toBe(false);
    expect(shortfallWorthReporting(input({
      plannedSlots: 15,
      published: 14,
      causes: [{ platform: "vk", reason: "исчерпана ёмкость моделей", count: 1 }],
      capacityExhausted: ["vk"],
    }))).toBe(true);
  });

  it("отпечаток состава одинаков при разном порядке причин", () => {
    const a = shortfallFingerprint(input());
    const b = shortfallFingerprint(input({ causes: [...input().causes].reverse() }));
    expect(a).toBe(b);
    expect(shortfallFingerprint(input({ published: 2 }))).not.toBe(a);
  });
});
