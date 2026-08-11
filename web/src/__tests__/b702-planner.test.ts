/**
 * B702 фаза 3 — планировщик тем свободных слотов из спроса и живых трендов.
 *
 * Поведение проверяется на контролируемой библиотеке (мок `approvedLibraryEntries`),
 * чтобы решение планировщика было детерминированным и не зависело от состава
 * живой библиотеки: три кандидата — один с большим спросом, один под трендом,
 * один без сигналов вовсе.
 */

import {
  marketingPlannerEnabled,
  planTopicsForSlots,
  type PlannedTopic,
} from "@/lib/marketing/planner";
import type { DemandSignals } from "@/lib/marketing/content-relevance";
import type { TrendCandidate } from "@/lib/marketing/trend-scan";
import type { ContentPlanSlot } from "@/lib/marketing/content-plan";

jest.mock("@/data/anonymous-library", () => ({
  approvedLibraryEntries: () => [
    { slug: "post-demand", topic: "Отношения", question: "спрос" },
    { slug: "post-trend", topic: "Отношения", question: "тренд" },
    { slug: "post-quiet", topic: "Отношения", question: "запас" },
  ],
}));

describe("B702 фаза 3 — планировщик тем слота", () => {
  it("выбирает тему с наибольшим спросом для слота", () => {
    const planned = plan({
      slots: [slot("t1")],
      signals: signals("высокий спрос тема"),
      usedByPlatform: new Map(),
    });
    expect(planned.get("t1")?.articleSlug).toBe("post-demand");
    expect(planned.get("t1")?.origin).toBe("core");
  });

  it("тема под живым трендом имеет приоритет над спросом", () => {
    const planned = plan({
      slots: [slot("t1")],
      trends: [trend("тренд")],
      usedByPlatform: new Map(),
    });
    expect(planned.get("t1")?.articleSlug).toBe("post-trend");
    expect(planned.get("t1")?.origin).toBe("trend");
    expect(planned.get("t1")?.rationale).toContain("тренд");
  });

  it("не отдаёт одну статью двум слотам прохода", () => {
    const planned = plan({
      slots: [slot("t1"), slot("t2"), slot("t3")],
      usedByPlatform: new Map(),
    });
    const slugs = [...planned.values()].map((topic: PlannedTopic) => topic.articleSlug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("не занимает статью, уже занятую на площадке слота", () => {
    const planned = plan({
      slots: [slot("t1")],
      usedByPlatform: new Map([["telegram", new Set(["post-demand"])]]),
    });
    expect(planned.get("t1")?.articleSlug).not.toBe("post-demand");
  });

  it("детерминирован: тот же вход даёт то же распределение", () => {
    const first = plan({
      slots: [slot("t1"), slot("t2"), slot("t3")],
      usedByPlatform: new Map(),
    });
    const second = plan({
      slots: [slot("t1"), slot("t2"), slot("t3")],
      usedByPlatform: new Map(),
    });
    expect([...first.entries()].map(([key, topic]) => [key, topic.articleSlug, topic.origin]))
      .toEqual([...second.entries()].map(([key, topic]) => [key, topic.articleSlug, topic.origin]));
  });

  it("без сигналов и трендов слот всё равно получает тему из библиотеки", () => {
    const planned = plan({
      slots: [slot("t1")],
      signals: signals("ни одной фразы из библиотеки здесь нет"),
      usedByPlatform: new Map(),
    });
    expect(planned.get("t1")?.articleSlug).toBeDefined();
    expect(["post-demand", "post-quiet", "post-trend"]).toContain(planned.get("t1")?.articleSlug);
  });

  it("гейт планировщика в тестах выключен (env по умолчанию)", () => {
    expect(marketingPlannerEnabled()).toBe(false);
  });
});

/** Слот с минимально достаточными полями для планировщика. */
function slot(key: string): ContentPlanSlot {
  return {
    key,
    channel: "telegram",
    cluster: "расставание и возврат",
    articleSlug: "vernetsya-li-byvshiy-ili-ya-zhdu-zrya",
    targetQuery: "вернётся ли бывший",
    order: 1,
    scheduledAt: "2026-08-12T09:00:00+03:00",
    format: "карточка",
    editorialAngle: "",
    contentClass: "card",
    daypart: "morning",
    toleranceMs: 3_600_000,
  };
}

function signals(phrase: string): DemandSignals {
  return { items: [{ phrase, demand: 100, source: "wordstat" }], window: null };
}

function trend(topic: string): TrendCandidate {
  return { topic, rationale: "обоснование", source: "discovery", keywords: [topic] };
}

function plan(input: {
  slots: ContentPlanSlot[];
  signals?: DemandSignals;
  trends?: TrendCandidate[];
  usedByPlatform: ReadonlyMap<string, ReadonlySet<string>>;
}): Map<string, PlannedTopic> {
  return planTopicsForSlots({
    slots: input.slots,
    signals: input.signals ?? signals("высокий спрос тема"),
    trends: input.trends ?? [],
    usedByPlatform: input.usedByPlatform,
  });
}