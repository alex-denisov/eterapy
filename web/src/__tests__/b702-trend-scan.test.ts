import {
  TREND_SCAN_LIMIT,
  scanTrends,
  type TrendCandidate,
  type TrendSource,
} from "@/lib/marketing/trend-scan";

describe("B702 фаза 2 — сканер живых трендов", () => {
  it("сбой одного источника не рвёт сканер", async () => {
    const breaking: TrendSource = async () => { throw new Error("сеть упала"); };
    const healthy: TrendSource = async () => [candidate("горячая тема")];
    const result = await scanTrends({ sources: [breaking, healthy] });
    expect(result).toHaveLength(1);
    expect(result[0].topic).toBe("горячая тема");
  });

  it("дедуплицирует кандидатов по теме", async () => {
    const first: TrendSource = async () => [candidate("таро и работа")];
    const second: TrendSource = async () => [candidate("таро и работа")];
    const result = await scanTrends({ sources: [first, second] });
    expect(result.filter((item) => item.topic === "таро и работа")).toHaveLength(1);
  });

  it("ограничивает число кандидатов сверху", async () => {
    const many: TrendSource = async () =>
      Array.from({ length: 50 }, (_, index) => candidate(`тема ${index}`));
    const result = await scanTrends({ sources: [many] });
    expect(result.length).toBe(TREND_SCAN_LIMIT);
  });

  it("уважает собственный лимит запрошенного числа кандидатов", async () => {
    const many: TrendSource = async () =>
      Array.from({ length: 50 }, (_, index) => candidate(`тема ${index}`));
    const result = await scanTrends({ sources: [many], limit: 3 });
    expect(result).toHaveLength(3);
  });

  it("не отдаёт пустые темы", async () => {
    const source: TrendSource = async () => [candidate("")];
    const result = await scanTrends({ sources: [source] });
    expect(result).toHaveLength(0);
  });
});

function candidate(topic: string): TrendCandidate {
  return { topic, rationale: "обоснование", source: "discovery", keywords: ["слово"] };
}
