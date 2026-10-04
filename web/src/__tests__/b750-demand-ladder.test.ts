/**
 * B750 — ЛЕСЕНКА ЧАСТОТНОСТИ.
 *
 * Агент брал из очереди запрос с НАИБОЛЬШЕЙ частотой (до 60 000), а при ИКС 0
 * такая фраза не взлетает никогда. Берём лучший запрос ВНУТРИ полосы
 * [пол, потолок]; потолок поднимается по мере роста сайта.
 */
import { clampDemandCeiling, pickLadderCandidate, SEO_DEMAND_FLOOR } from "@/lib/seo/demand-ladder";

const c = (id: string, monthlyDemand: number | null, growth = 0) => ({ id, monthlyDemand, growth });

describe("pickLadderCandidate", () => {
  it("берёт самый частотный запрос внутри полосы, а не самый частотный вообще", () => {
    const picked = pickLadderCandidate([c("head", 40_000), c("mid", 2_500), c("tail", 400)], 3_000);
    expect(picked?.id).toBe("mid");
  });

  it("запросы ниже пола не берутся вовсе", () => {
    expect(pickLadderCandidate([c("dust", SEO_DEMAND_FLOOR - 1), c("zero", 0)], 3_000)).toBeNull();
  });

  it("полоса пуста — берёт самый низкий из тех, что выше потолка, очередь не голодает", () => {
    const picked = pickLadderCandidate([c("big", 30_000), c("next", 5_000)], 3_000);
    expect(picked?.id).toBe("next");
  });

  it("неизмеренный спрос идёт последним и только по росту", () => {
    const picked = pickLadderCandidate([c("trend-a", null, 0.4), c("trend-b", null, 0.9)], 3_000);
    expect(picked?.id).toBe("trend-b");
    const mixed = pickLadderCandidate([c("trend", null, 0.9), c("measured", 350)], 3_000);
    expect(mixed?.id).toBe("measured");
  });

  it("пустая очередь — null", () => {
    expect(pickLadderCandidate([], 3_000)).toBeNull();
  });
});

describe("баланс направлений", () => {
  const k = (id: string, demand: number, cluster: string) => ({ id, monthlyDemand: demand, growth: 0, cluster });

  it("направление без страниц идёт раньше более частотного, но уже покрытого", () => {
    const coverage = new Map([["Астрология", 12]]);
    const picked = pickLadderCandidate([k("astro", 2_900, "Астрология"), k("family", 700, "Семья и род")], 3_000, coverage);
    expect(picked?.id).toBe("family");
  });

  it("при равном охвате берёт самый частотный", () => {
    const picked = pickLadderCandidate([k("a", 500, "Пара"), k("b", 2_000, "Пара")], 3_000, new Map([["Пара", 1]]));
    expect(picked?.id).toBe("b");
  });

  it("без карты охвата ведёт себя как раньше", () => {
    expect(pickLadderCandidate([k("a", 500, "Пара"), k("b", 2_000, "Астрология")], 3_000)?.id).toBe("b");
  });
});

describe("clampDemandCeiling", () => {
  it("держит значение в границах и возвращает умолчание на мусор", () => {
    expect(clampDemandCeiling(100)).toBe(1_000);
    expect(clampDemandCeiling(1_000_000)).toBe(60_000);
    expect(clampDemandCeiling(Number.NaN)).toBe(3_000);
    expect(clampDemandCeiling(5_000)).toBe(5_000);
  });
});
