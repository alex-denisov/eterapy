/**
 * B718 — уникальный слаг не спасает от однотемной ленты.
 *
 * Замер прода 2026-08-23, сразу после включения запрета повтора СТАТЬИ:
 * 56 черновиков, 29 из них в кластере «Матрица судьбы». Заголовки разные
 * («9 аркан», «13 аркан», «16 аркан»), лента одна и та же. Жадный выбор идёт
 * сверху ранжирования спроса, а верх занимает один кластер целиком.
 */
import { planTopicsForSlots } from "@/lib/marketing/planner";
import type { ContentPlanSlot } from "@/lib/marketing/content-plan";
import type { DemandSignals } from "@/lib/marketing/content-relevance";

function slot(channel: ContentPlanSlot["channel"], scheduledAt: string, key: string): ContentPlanSlot {
  return {
    key,
    channel,
    cluster: "запас",
    articleSlug: "zapas",
    targetQuery: "запас",
    order: 1,
    scheduledAt,
    format: "карточка",
    editorialAngle: "угол",
    contentClass: "card",
    daypart: "morning",
    toleranceMs: 7_200_000,
    reserve: "planned",
  };
}

const EMPTY_SIGNALS: DemandSignals = { items: [] } as unknown as DemandSignals;

describe("B718 · план не сводится к одному кластеру", () => {
  it("в одни сутки один кластер занимает не больше одного слота на весь флот", () => {
    const slots = [
      slot("telegram", "2026-09-01T08:30:00+03:00", "s1"),
      slot("threads", "2026-09-01T10:45:00+03:00", "s2"),
      slot("vk", "2026-09-01T11:30:00+03:00", "s3"),
      slot("dzen", "2026-09-01T09:30:00+03:00", "s4"),
      slot("telegram", "2026-09-02T08:30:00+03:00", "s5"),
      slot("threads", "2026-09-02T10:45:00+03:00", "s6"),
    ];

    const planned = planTopicsForSlots({
      slots,
      signals: EMPTY_SIGNALS,
      trends: [],
      usedByPlatform: new Map(),
    });

    const byDay = new Map<string, string[]>();
    for (const [key, topic] of planned) {
      const day = slots.find((entry) => entry.key === key)!.scheduledAt.slice(0, 10);
      byDay.set(day, [...(byDay.get(day) ?? []), topic.cluster]);
    }

    expect(byDay.size).toBeGreaterThan(0);
    for (const clusters of byDay.values()) {
      // Ровно то свойство, которого не было: в сутках каждый кластер один раз.
      expect(new Set(clusters).size).toBe(clusters.length);
    }
  });

  it("пустой слот хуже однотемного: правило уступает, когда выбора нет", () => {
    // Восемь слотов в одни сутки при библиотеке, где кластеров заведомо меньше
    // восьми, обязаны быть заняты все: правило про разнообразие, а не про
    // право оставить слот пустым.
    const slots = Array.from({ length: 8 }, (_, index) =>
      slot("telegram", "2026-09-03T08:30:00+03:00", `d${index}`));

    const planned = planTopicsForSlots({
      slots,
      signals: EMPTY_SIGNALS,
      trends: [],
      usedByPlatform: new Map(),
    });

    expect(planned.size).toBe(slots.length);
    // И статьи всё равно не повторяются.
    expect(new Set([...planned.values()].map((topic) => topic.articleSlug)).size).toBe(slots.length);
  });
});
