/**
 * B753 — две правки одной настройки в разные стороны не должны обнулять друг друга.
 *
 * Прод 2026-10-01…10: `seo.raise_cap` поднимал `seo.pages_per_day` до 2–3, а
 * `kpi.seo.pages_per_day` на следующем проходе возвращал 1. Обе правки значились
 * APPLIED, владелец каждое утро читал «поднимаю потолок», итоговое значение
 * не менялось ни разу.
 */

import { AGENT_KPIS, judgeKpi, qualityBlocksGrowth } from "@/lib/marketing/kpi";
import { arbitrateDirectives } from "@/lib/marketing/orchestrator-arbiter";
import type { OrchestratorDirective } from "@/lib/marketing/orchestrator-actions";
import type { OrchestratorFinding } from "@/lib/marketing/orchestrator-diagnosis";

function verdict(id: string, actual: number | null) {
  const definition = AGENT_KPIS.find((kpi) => kpi.id === id)!;
  return judgeKpi({ definition, actual, period: "month" });
}

const setCap = (key: string, value: number): OrchestratorDirective => ({
  key,
  target: "seo",
  action: "set_setting",
  payload: { key: "seo.pages_per_day", value },
  problem: "p",
  rationale: "r",
  risk: "reversible",
});

const raiseFinding = (value: number): OrchestratorFinding => ({
  code: "seo.cap_below_demand",
  severity: "observation",
  title: "Очередь запросов 40 при потолке 1 страниц в сутки",
  detail: "Потолок можно поднять.",
  directive: setCap("2026-10-10:seo.raise_cap", value),
});

describe("qualityBlocksGrowth", () => {
  it("true, когда уникальность ниже цели", () => {
    expect(qualityBlocksGrowth([verdict("seo.unique_share", 1)])).toBe(true);
  });
  it("false, когда замера нет: отсутствие замера не запрет", () => {
    expect(qualityBlocksGrowth([verdict("seo.unique_share", null)])).toBe(false);
    expect(qualityBlocksGrowth([])).toBe(false);
  });
});

describe("arbitrateDirectives", () => {
  it("снимает повышение потолка, пока качество просело, и говорит об этом в находке", () => {
    const out = arbitrateDirectives({
      findings: [raiseFinding(2)],
      extra: [],
      currentCap: 1,
      qualityBlocks: true,
    });
    expect(out.directives).toHaveLength(0);
    expect(out.findings[0]?.directive).toBeUndefined();
    expect(out.findings[0]?.detail).toMatch(/не поднят/i);
  });

  it("пропускает повышение, когда качество в норме", () => {
    const out = arbitrateDirectives({ findings: [raiseFinding(2)], extra: [], currentCap: 1, qualityBlocks: false });
    expect(out.directives.map((d) => d.key)).toEqual(["2026-10-10:seo.raise_cap"]);
  });

  it("при встречных правках одной настройки остаётся осторожная", () => {
    const out = arbitrateDirectives({
      findings: [raiseFinding(3)],
      extra: [setCap("2026-10-10:kpi.seo.pages_per_day", 1)],
      currentCap: 2,
      qualityBlocks: false,
    });
    expect(out.directives).toHaveLength(1);
    expect(out.directives[0]?.payload.value).toBe(1);
  });

  it("правки разных настроек не трогает", () => {
    const other: OrchestratorDirective = {
      ...setCap("k2", 5),
      payload: { key: "marketing.conveyor.max_awaiting_review", value: 5 },
    };
    const out = arbitrateDirectives({ findings: [], extra: [setCap("k1", 1), other], currentCap: 2, qualityBlocks: false });
    expect(out.directives).toHaveLength(2);
  });
});
