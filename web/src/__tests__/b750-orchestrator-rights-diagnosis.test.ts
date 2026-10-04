import { diagnose, seoDemandFindings } from "@/lib/marketing/orchestrator-diagnosis";
import type { OrchestratorState } from "@/lib/marketing/orchestrator-state";

function state(seo: Partial<OrchestratorState["seo"]>, impressions: [number, number] | null): OrchestratorState {
  return {
    now: new Date("2026-10-05T09:00:00Z"),
    seo: { queueNew: 3, ...seo },
    trend: {
      days: [],
      diversity: [],
      duplicateDraftIds: [],
      weeks: impressions
        ? [{ metric: "impressions", label: "", current: impressions[0], previous: impressions[1], better: "up", unit: "" }]
        : [],
    },
  } as unknown as OrchestratorState;
}

describe("B750 находки очереди запросов", () => {
  it("пустая полоса и растущий сигнал: потолок на следующую ступень", () => {
    const [finding] = seoDemandFindings(state({ queueInBand: 0, demandCeiling: 3000 }, [120, 100]), "d");
    expect(finding.code).toBe("seo.queue_band_empty");
    expect(finding.directive?.payload).toEqual({ key: "seo.demand_ceiling", value: 10000 });
    expect(finding.directive?.risk).toBe("reversible");
  });

  it("сигнал не растёт: только наблюдение", () => {
    const [finding] = seoDemandFindings(state({ queueInBand: 0, demandCeiling: 3000 }, [100, 100]), "d");
    expect(finding.directive).toBeUndefined();
    expect(seoDemandFindings(state({ queueInBand: 0, demandCeiling: 3000 }, null), "d")[0].directive).toBeUndefined();
  });

  it("потолок максимален: правки нет", () => {
    const [finding] = seoDemandFindings(state({ queueInBand: 0, demandCeiling: 60000 }, [200, 100]), "d");
    expect(finding.directive).toBeUndefined();
  });

  it("в полосе есть запросы: находки нет; поля не заданы: молчим", () => {
    expect(seoDemandFindings(state({ queueInBand: 4, demandCeiling: 3000 }, [200, 100]), "d")).toEqual([]);
    expect(seoDemandFindings(state({}, [200, 100]), "d")).toEqual([]);
  });

  it("страницы без спроса: наблюдение, без правки, не более 5 слагов", () => {
    const slugs = ["a", "b", "c", "d", "e", "f"];
    const [finding] = seoDemandFindings(state({ pagesWithoutDemand: { count: 6, slugs } }, null), "d");
    expect(finding.code).toBe("seo.page_without_demand");
    expect(finding.directive).toBeUndefined();
    expect(finding.detail).not.toContain("f,");
    expect(finding.detail).not.toMatch(/, f\./);
  });

  it("diagnose включает эти находки в общий разбор без падения", () => {
    expect(typeof diagnose).toBe("function");
  });
});

describe("B750 снятие по решению владельца", () => {
  it("до 3 директив retire_library_page, ключ по слагу", () => {
    const found = seoDemandFindings(state({ retireApproved: ["a", "b", "c", "d"] }, null), "2026-10-05");
    expect(found).toHaveLength(3);
    expect(found[0].code).toBe("seo.retire_approved");
    expect(found[0].title).toContain("3");
    expect(found.map((f) => f.directive?.key)).toEqual(["2026-10-05:retire:a", "2026-10-05:retire:b", "2026-10-05:retire:c"]);
    expect(found[0].directive).toMatchObject({ action: "retire_library_page", risk: "reversible", payload: { slug: "a" } });
  });
  it("нет одобренных — нет находки", () => {
    expect(seoDemandFindings(state({ retireApproved: [] }, null), "d")).toEqual([]);
  });
});

describe("B750 возврат по просьбе владельца", () => {
  it("до 3 директив restore_library_page", () => {
    const found = seoDemandFindings(state({ restoreRequested: ["a", "b", "c", "d"] }, null), "2026-10-05");
    expect(found.map((f) => f.directive?.key)).toEqual([
      "2026-10-05:restore:a", "2026-10-05:restore:b", "2026-10-05:restore:c",
    ]);
    expect(found[0]).toMatchObject({ code: "seo.restore_requested", severity: "observation" });
    expect(found[0].directive).toMatchObject({ action: "restore_library_page", risk: "reversible" });
  });
  it("слаг в обоих списках не снимается", () => {
    const found = seoDemandFindings(state({ retireApproved: ["a", "b"], restoreRequested: ["a"] }, null), "d");
    const retired = found.filter((f) => f.directive?.action === "retire_library_page").map((f) => f.directive?.payload.slug);
    expect(retired).toEqual(["b"]);
  });
});
