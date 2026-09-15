/**
 * B746 §2 — ТЕМА ПЛАНИРОВЩИКА СЧИТАЕТСЯ ЗАНЯТОЙ, А КЛАСТЕРЫ РОТИРУЮТСЯ.
 *
 * Замер прода 2026-09-15: Telegram за 14 суток — 41 пост, 16 заголовков;
 * «9 аркан (Отшельник) в матрице судьбы» вышел 10 раз за 12 суток. Причина:
 * `topicArticleSlug` знала только 16 остовных тем константы `TOPICS`, тема
 * планировщика (карточка Библиотеки) возвращала `null` и НЕ считалась занятой;
 * квота кластера на сутки жила внутри одного прохода, а проход добавляет
 * один-два слота.
 */
import { planTopicsForSlots } from "@/lib/marketing/planner";
import { topicArticleSlug, type ContentPlanSlot } from "@/lib/marketing/content-plan";
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

describe("B746 §2 — тема строки реестра опознаётся по слагу статьи", () => {
  it("utm_content (слаг статьи) сильнее запроса и кластера", () => {
    expect(topicArticleSlug({
      utmContent: "9-arkan-otshelnik-v-matritse-sudby",
      targetQuery: "9 аркан Отшельник в матрице судьбы",
      cluster: "Матрица судьбы",
    })).toBe("9-arkan-otshelnik-v-matritse-sudby");
    // Прежний разбор для строк без utm_content не тронут.
    expect(topicArticleSlug({ targetQuery: "вернётся ли бывший" })).toBe("vernetsya-li-byvshiy-ili-ya-zhdu-zrya");
    // Мусор в utm_content слагом не считается.
    expect(topicArticleSlug({ utmContent: "не слаг", targetQuery: "вернётся ли бывший" }))
      .toBe("vernetsya-li-byvshiy-ili-ya-zhdu-zrya");
    expect(topicArticleSlug({ utmContent: null, targetQuery: null, cluster: null })).toBeNull();
  });
});

describe("B746 §2 — планировщик ротирует кластеры по факту окна", () => {
  it("кластер, уже стоящий в плане, уступает тому, что выходил реже", () => {
    const slots = [
      slot("telegram", "2026-09-20T08:30:00+03:00", "a"),
      slot("telegram", "2026-09-21T08:30:00+03:00", "b"),
      slot("telegram", "2026-09-22T08:30:00+03:00", "c"),
      slot("telegram", "2026-09-23T08:30:00+03:00", "d"),
    ];
    const cold = planTopicsForSlots({ slots, signals: EMPTY_SIGNALS, trends: [], usedByPlatform: new Map() });
    const coldClusters = [...cold.values()].map((topic) => topic.cluster);
    // Кластер первого слота — «лидер спроса». Скажем планировщику, что он уже
    // стоит в окне много раз: он обязан уйти в конец очереди.
    const leader = coldClusters[0];
    const warm = planTopicsForSlots({
      slots,
      signals: EMPTY_SIGNALS,
      trends: [],
      usedByPlatform: new Map(),
      clusterUsage: new Map([[leader, 20]]),
    });
    const warmClusters = [...warm.values()].map((topic) => topic.cluster);
    expect(warmClusters[0]).not.toBe(leader);
    // И один проход не отдаёт один кластер двум соседним суткам, пока есть
    // другие: ротация видна на четырёх слотах.
    expect(new Set(warmClusters).size).toBeGreaterThanOrEqual(3);
  });

  it("квота кластера на сутки видит строки, созданные прошлыми проходами", () => {
    const slots = [slot("threads", "2026-09-20T10:45:00+03:00", "x")];
    const cold = planTopicsForSlots({ slots, signals: EMPTY_SIGNALS, trends: [], usedByPlatform: new Map() });
    const first = cold.get("x")!.cluster;
    const seeded = planTopicsForSlots({
      slots,
      signals: EMPTY_SIGNALS,
      trends: [],
      usedByPlatform: new Map(),
      clustersByDay: new Map([["2026-09-20", new Set([first])]]),
    });
    expect(seeded.get("x")!.cluster).not.toBe(first);
  });

  it("решение остаётся детерминированным", () => {
    const slots = [
      slot("vk", "2026-09-20T11:30:00+03:00", "v1"),
      slot("vk", "2026-09-21T11:30:00+03:00", "v2"),
    ];
    const usage = new Map([["Матрица судьбы", 3]]);
    const once = planTopicsForSlots({ slots, signals: EMPTY_SIGNALS, trends: [], usedByPlatform: new Map(), clusterUsage: usage });
    const twice = planTopicsForSlots({ slots, signals: EMPTY_SIGNALS, trends: [], usedByPlatform: new Map(), clusterUsage: usage });
    expect([...once.values()]).toEqual([...twice.values()]);
  });
});
