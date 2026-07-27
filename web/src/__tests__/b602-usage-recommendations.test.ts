/**
 * B602 · «Рекомендуем вам» — ряд 3 слева.
 *
 * Владелец: «третий ряд — блок "с чего начать", но нужно его переделать в
 * рекомендательный блок и переименовать в "рекомендуем вам", и дальше
 * рекомендации делать на основании ИСПОЛЬЗОВАННЫХ РАЗБОРОВ».
 *
 * Отсюда единственный содержательный инвариант блока: он смотрит на то, что
 * человек уже прошёл. Соседний блок ряда 4 («что дальше по вашей теме»)
 * смотрит на доминирующую ТЕМУ — это разные сигналы, и одинаковых плиток в
 * двух рядах быть не должно.
 */

import {
  buildUsageRecommendations,
  buildServiceNudge,
  daySeed,
  type CabinetSignals,
} from "@/lib/cabinet-recommendations";

const BASE: CabinetSignals = {
  topicCounts: {},
  lastDialogue: null,
  activeRoute: null,
  recentProductKeys: [],
  hasUpcomingBooking: false,
  lastPastBooking: null,
  journal: { total: 0, entryToday: false, streak: 0 },
  crisisGuard: false,
};

const seed = daySeed("user-1", new Date("2026-07-27T00:00:00Z"));

describe("buildUsageRecommendations", () => {
  it("рекомендует то, что примыкает к уже пройденному", () => {
    const items = buildUsageRecommendations({ ...BASE, recentProductKeys: ["reframe"] }, seed);
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((item) => item.reason.includes("Переосмысление"))).toBe(true);
  });

  it("никогда не предлагает то, что человек уже проходил", () => {
    const used = ["reframe", "deep-report"];
    const items = buildUsageRecommendations({ ...BASE, recentProductKeys: used }, seed);
    for (const item of items) expect(used).not.toContain(item.productKey);
  });

  it("не повторяет одну и ту же услугу дважды в списке", () => {
    const items = buildUsageRecommendations({ ...BASE, recentProductKeys: ["tarot", "numerology"] }, seed);
    expect(new Set(items.map((i) => i.productKey)).size).toBe(items.length);
  });

  it("новичку без истории даёт бесплатную дверь первой", () => {
    const items = buildUsageRecommendations(BASE, seed);
    expect(items[0]?.kind).toBe("start");
    expect(items[0]?.route).toBe("/checkin");
  });

  it("в кризисе не рекомендует ничего платного", () => {
    const items = buildUsageRecommendations(
      { ...BASE, recentProductKeys: ["reframe"], crisisGuard: true },
      seed,
    );
    expect(items).toHaveLength(0);
  });

  it("отдаёт не больше трёх плиток — ряд 3 не должен стать мозаикой", () => {
    const items = buildUsageRecommendations(
      { ...BASE, recentProductKeys: ["reframe", "tarot", "natal-chart"] },
      seed,
    );
    expect(items.length).toBeLessThanOrEqual(3);
  });

  it("не дублирует блок ряда 4 «что дальше по вашей теме»", () => {
    // Тот самый риск, о котором предупреждал UX-разбор: два блока на одном
    // движке. Здесь движки разные — использованные услуги против темы.
    const signals: CabinetSignals = {
      ...BASE,
      recentProductKeys: ["reframe"],
      topicCounts: { relationships: 4 },
    };
    const nudge = buildServiceNudge(signals, seed);
    const items = buildUsageRecommendations(signals, seed);
    if (nudge) {
      expect(items.map((item) => item.productKey)).not.toContain(nudge.productKey);
    }
  });

  it("устойчив к неизвестному ключу продукта", () => {
    const items = buildUsageRecommendations({ ...BASE, recentProductKeys: ["ключ-которого-нет"] }, seed);
    expect(Array.isArray(items)).toBe(true);
    for (const item of items) expect(item.route.startsWith("/")).toBe(true);
  });
});
