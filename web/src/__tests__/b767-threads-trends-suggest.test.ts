import { describe, expect, it, jest } from "@jest/globals";
import {
  TREND_SEEDS,
  fetchSuggestTrendTexts,
  fetchWordstatTrendTexts,
  wordstatLine,
  parseYandexSuggest,
  seedsForPass,
} from "@/lib/marketing/threads-trends";

describe("B767 тренды без ключей: подсказки поиска", () => {
  it("разбирает ответ suggest-ff", () => {
    expect(parseYandexSuggest(["расклад таро на", ["расклад таро на любовь", "расклад таро на неделю"]]))
      .toEqual(["расклад таро на любовь", "расклад таро на неделю"]);
    expect(parseYandexSuggest({ nope: 1 })).toEqual([]);
    expect(parseYandexSuggest(["q", [1, null, "ok"]])).toEqual(["ok"]);
  });

  it("зёрна по проходам идут по кругу и не повторяются в проходе", () => {
    const first = seedsForPass(new Date("2026-10-13T00:00:00Z"), 6);
    expect(new Set(first).size).toBe(6);
    expect(seedsForPass(new Date("2026-10-15T00:00:00Z"), 6)).not.toEqual(first);
    expect(first.every((seed) => TREND_SEEDS.includes(seed))).toBe(true);
  });

  it("собирает строки «запросы людей»; сбой одного зерна не роняет остальные", async () => {
    const fetchImpl = jest.fn(async (url: URL | string) => {
      const part = new URL(String(url)).searchParams.get("part") ?? "";
      if (part.startsWith("плохо")) throw new Error("timeout");
      return new Response(JSON.stringify([part, [`${part}любовь`, `${part}работа`, "x"]]), { status: 200 });
    }) as unknown as typeof fetch;
    const texts = await fetchSuggestTrendTexts({ seeds: ["расклад таро на ", "плохо "], fetchImpl });
    expect(texts).toHaveLength(1);
    expect(texts[0]).toContain("Запросы людей");
    expect(texts[0]).toContain("расклад таро на любовь");
    expect(texts[0]).not.toContain("; x");
  });

  it("Wordstat: строка с числом показов, пусто без фраз", () => {
    expect(wordstatLine("расклад таро на ", [{ phrase: "расклад таро на любовь", count: 1200 }])).toBe(
      "Запросы людей (Wordstat, показов в месяц) по «расклад таро на»: расклад таро на любовь (1200)");
    expect(wordstatLine("луна в ", [])).toBeNull();
  });

  it("Wordstat молчит без ключа и переживает сбой зерна", async () => {
    const now = new Date("2026-10-13T00:00:00Z");
    expect(await fetchWordstatTrendTexts({ now, env: {} })).toEqual([]);
    let n = 0;
    const topRequests = (async () => {
      n += 1;
      if (n === 1) throw new Error("429");
      return [{ phrase: "мой бывший написал ночью", count: 90 }];
    }) as never;
    const texts = await fetchWordstatTrendTexts({
      now, env: { YANDEX_WORDSTAT_API_KEY: "k", YANDEX_CLOUD_FOLDER_ID: "f" }, topRequests,
    });
    expect(texts).toHaveLength(2);
  });
});
