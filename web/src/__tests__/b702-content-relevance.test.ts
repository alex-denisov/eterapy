import {
  createDemandScorer,
  demandFromCore,
  demandFromGsc,
  demandFromWebmaster,
  demandFromWordstat,
  mergeDemandSignals,
  scoreTopicDemand,
} from "@/lib/marketing/content-relevance";
import type { SearchQueryMetric } from "@/lib/search-marketing-parsers";
import type { WordstatMetric } from "@/lib/search-marketing-parsers";

describe("B702 фаза 1 — спрос как вход планировщика", () => {
  it("тема из высокочастотного кластера получает балл выше темы без спроса", () => {
    // Спрос: только «таро». Тема про таро обязана выиграть у темы про школу.
    const signals = mergeDemandSignals([
      [{ phrase: "гадание на таро", demand: 10_000, source: "wordstat" }],
    ]);
    const tarot = scoreTopicDemand({ targetQuery: "гадание на таро" }, signals);
    const school = scoreTopicDemand({ targetQuery: "как выбрать школу" }, signals);
    expect(tarot.score).toBeGreaterThan(0);
    expect(school.score).toBe(0);
    expect(tarot.score).toBeGreaterThan(school.score);
  });

  it("живой источник весит больше разового замера при равном спросе", () => {
    const signals = mergeDemandSignals([
      [{ phrase: "матрица судьбы", demand: 1_000, source: "semanticCore" }],
      [{ phrase: "матрица судьбы", demand: 1_000, source: "wordstat" }],
    ]);
    const scored = scoreTopicDemand({ targetQuery: "матрица судьбы" }, signals);
    expect(scored.score).toBe(
      Math.log1p(1_000) + 2 * Math.log1p(1_000),
    );
    expect(scored.sources).toEqual(expect.arrayContaining(["semanticCore", "wordstat"]));
  });

  it("пустой источник не валит ни снимок, ни scorer", () => {
    const signals = mergeDemandSignals([[], [], [], []]);
    expect(signals.items).toHaveLength(0);
    const scored = scoreTopicDemand({ targetQuery: "таро" }, signals);
    expect(scored.score).toBe(0);
    expect(scored.matched).toHaveLength(0);
    expect(scoreTopicDemand({ targetQuery: "таро" }, {
      items: [{ phrase: "таро онлайн", demand: 5_000, source: "gsc" }],
    }).score).toBeGreaterThan(0);
  });

  it("объединяет все четыре источника и не дублирует фразы в матчах", () => {
    const core = demandFromCore();
    expect(core.length).toBeGreaterThan(1_000);
    const wordstat: WordstatMetric[] = [{ phrase: "к чему снится вода", monthlyDemand: 3_000 }];
    const webmaster: SearchQueryMetric[] = [{
      query: "к чему снится вода в доме",
      impressions: 120,
      clicks: 3,
      ctr: 2.5,
      averagePosition: 12,
      opportunity: "Быстрый рост",
    }];
    const gsc: SearchQueryMetric[] = [];
    const signals = mergeDemandSignals([
      core,
      demandFromWordstat(wordstat),
      demandFromWebmaster(webmaster),
      demandFromGsc(gsc),
    ]);
    const scored = scoreTopicDemand({ targetQuery: "к чему снится вода" }, signals);
    expect(scored.score).toBeGreaterThan(0);
    // Одна фраза из wordstat и одна из webmaster; каждая — по одному разу.
    expect(scored.matched.filter((item) => item.source === "wordstat")).toHaveLength(1);
    expect(scored.matched.filter((item) => item.source === "webmaster")).toHaveLength(1);
  });

  it("тема с нулевым спросом в вебмастере не попадает в снимок", () => {
    const webmaster: SearchQueryMetric[] = [{
      query: "таро",
      impressions: 0,
      clicks: 0,
      ctr: 0,
      averagePosition: null,
      opportunity: "Усилить страницу",
    }];
    expect(demandFromWebmaster(webmaster)).toHaveLength(0);
  });

  it("снимок спроса стеммится один раз на планировщик, а не на каждую тему", () => {
    // 1750 фраз ядра × сотни тем библиотеки: если матчер пересобирается на
    // каждый вызов, проход планировщика встаёт на десятки секунд внутри крона.
    const signals = mergeDemandSignals([demandFromCore()]);
    const scorer = createDemandScorer(signals);
    const started = Date.now();
    for (let index = 0; index < 200; index += 1) {
      scorer({ targetQuery: "к чему снится вода" });
    }
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("готовый scorer отвечает то же, что разовый вызов", () => {
    const signals = mergeDemandSignals([
      [{ phrase: "матрица судьбы", demand: 1_000, source: "semanticCore" }],
      [{ phrase: "матрица судьбы расчёт", demand: 400, source: "gsc" }],
    ]);
    const topic = { targetQuery: "матрица судьбы" };
    expect(createDemandScorer(signals)(topic)).toEqual(scoreTopicDemand(topic, signals));
  });

  it("без targetQuery тема не матчится — кластер не заменяет запрос", () => {
    const signals = mergeDemandSignals([
      [{ phrase: "вернётся ли бывший", demand: 500, source: "webmaster" }],
    ]);
    const scored = scoreTopicDemand({ targetQuery: "", cluster: "расставание и возврат" }, signals);
    expect(scored.score).toBe(0);
  });
});