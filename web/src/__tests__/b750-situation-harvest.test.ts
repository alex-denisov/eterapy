/** B750 — сбор от ситуации: модель предлагает, Wordstat измеряет, квота бережётся. */
jest.mock("@/lib/db", () => ({ __esModule: true, default: {} }));
jest.mock("@/lib/ai", () => ({ aiComplete: jest.fn() }));
jest.mock("@/lib/marketing/pool-capacity", () => ({ marketingPoolAvailability: jest.fn() }));

import {
  clusterForRun,
  harvestSituations,
  parseSituationPhrases,
  SITUATION_MEASURE_LIMIT,
  type SituationHarvestDeps,
} from "@/lib/seo/demand/situation-harvest";

const clusters = [
  { cluster: "Пара", service: "pair" },
  { cluster: "Сны", service: "dream" },
  { cluster: "Семья и род", service: "family-questions" },
];

function deps(overrides: Partial<SituationHarvestDeps> = {}) {
  const saved: Array<{ phrase: string; monthlyDemand: number; cluster: string; service: string }> = [];
  const base: SituationHarvestDeps = {
    generate: async () => JSON.stringify(["муж изменил что делать", "как понять что он меня не любит"]),
    measure: async () => 500,
    covered: async () => new Set<string>(),
    known: async () => new Set<string>(),
    save: async (row) => {
      saved.push(row);
    },
    ...overrides,
  };
  return { deps: base, saved };
}

describe("B750 clusterForRun", () => {
  it("за N часов обходит все кластеры по кругу", () => {
    const base = Date.UTC(2026, 9, 5, 0, 0, 0);
    const seen = [0, 1, 2, 3].map((h) => clusterForRun(new Date(base + h * 3_600_000), clusters)?.cluster);
    expect(new Set(seen.slice(0, 3)).size).toBe(3);
    expect(seen[3]).toBe(seen[0]);
  });
  it("на пустом списке — null", () => {
    expect(clusterForRun(new Date(), [])).toBeNull();
  });
  it("внутри часа кластер не меняется", () => {
    const t = Date.UTC(2026, 9, 5, 7, 0, 0);
    expect(clusterForRun(new Date(t), clusters)).toBe(clusterForRun(new Date(t + 3_599_000), clusters));
  });
});

describe("B750 parseSituationPhrases", () => {
  it("разбирает массив в ограде и с прозой вокруг", () => {
    expect(parseSituationPhrases('Вот:\n```json\n["Муж изменил что делать.", "к чему снится бывший"]\n```')).toEqual([
      "муж изменил что делать",
      "к чему снится бывший",
    ]);
  });
  it("мусор и не-массив дают пустой список, а не исключение", () => {
    expect(parseSituationPhrases("не json")).toEqual([]);
    expect(parseSituationPhrases("[1, {}, null")).toEqual([]);
    expect(parseSituationPhrases("")).toEqual([]);
  });
});

describe("B750 harvestSituations", () => {
  const now = new Date(Date.UTC(2026, 9, 5, 0, 0, 0));

  it("сохраняет фразы со спросом >= 300, кластер и услугу берёт у кластера", async () => {
    const { deps: d, saved } = deps();
    const result = await harvestSituations({ now, deps: d, clusters });
    expect(result.accepted).toBe(2);
    expect(saved[0]).toMatchObject({ cluster: expect.any(String), service: expect.any(String), monthlyDemand: 500 });
  });

  it("не сохраняет фразу с частотой ниже порога", async () => {
    const { deps: d, saved } = deps({ measure: async () => 120 });
    const result = await harvestSituations({ now, deps: d, clusters });
    expect(result).toMatchObject({ measured: 2, accepted: 0 });
    expect(saved).toHaveLength(0);
  });

  it("мусор модели отсекается до измерения и не тратит квоту", async () => {
    const measure = jest.fn(async (_phrase: string) => 900);
    const { deps: d } = deps({
      generate: async () => JSON.stringify(["путин что делать", "жена изменила мужу видео", "муж изменил что делать"]),
      measure,
    });
    const result = await harvestSituations({ now, deps: d, clusters });
    expect(measure).toHaveBeenCalledTimes(1);
    expect(result.filtered).toBe(2);
  });

  it("не меряет больше лимита и пропускает уже известные фразы", async () => {
    const phrases = Array.from({ length: 40 }, (_, i) => `как понять почему муж молчит вариант ${"абвгдежзик"[i % 10]}${"лмнопрстуф"[Math.floor(i / 10) % 10]}${"яюэ"[i % 3]}`);
    const measure = jest.fn(async (_phrase: string) => 0);
    const { deps: d } = deps({
      generate: async () => JSON.stringify(phrases),
      measure,
      known: async () => new Set([phrases[0]].map((p) => p.toLowerCase())),
    });
    await harvestSituations({ now, deps: d, clusters });
    expect(measure.mock.calls.length).toBeLessThanOrEqual(SITUATION_MEASURE_LIMIT);
    expect(measure.mock.calls.map((c) => c[0])).not.toContain(phrases[0]);
  });

  it("на 429 останавливается и сохранённое остаётся", async () => {
    let calls = 0;
    const { deps: d, saved } = deps({
      measure: async () => {
        calls += 1;
        if (calls === 2) throw new Error("wordstat HTTP 429");
        return 800;
      },
    });
    const result = await harvestSituations({ now, deps: d, clusters });
    expect(result.quotaStopped).toBe(true);
    expect(calls).toBe(2);
    expect(saved).toHaveLength(1);
  });

  it("отказ модели не бросает", async () => {
    const { deps: d } = deps({
      generate: async () => {
        throw new Error("пул молчит");
      },
    });
    await expect(harvestSituations({ now, deps: d, clusters })).resolves.toMatchObject({ accepted: 0 });
  });
});
