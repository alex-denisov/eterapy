/**
 * B752 — два отдельных отчёта: SEO (просадки, без среза Wordstat) и SMM
 * (площадки, «гипотеза → результат»), до 1200 знаков, антиповтор по отпечатку.
 */
import {
  REPORT_HARD_CAP,
  belongsTo,
  buildSeoReport,
  buildSmmReport,
  reportFingerprint,
  unchangedLine,
} from "@/lib/marketing/orchestrator-reports";
import { AGENT_KPIS, judgeKpi } from "@/lib/marketing/kpi";
import type { OrchestratorFinding } from "@/lib/marketing/orchestrator-diagnosis";
import type { OrchestratorDirective } from "@/lib/marketing/orchestrator-actions";

const weeks = [
  { metric: "impressions", label: "Показы", current: 40, previous: 100, better: "up", unit: "" },
  { metric: "clicks", label: "Клики", current: 3, previous: 3, better: "up", unit: "" },
  { metric: "seoPages", label: "Страниц Библиотеки", current: 5, previous: 4, better: "up", unit: "" },
  { metric: "posts", label: "Постов", current: 20, previous: 30, better: "up", unit: "" },
  { metric: "distinctShare", label: "Разных заголовков", current: 50, previous: 40, better: "up", unit: " %" },
  { metric: "views", label: "Просмотров", current: 900, previous: 800, better: "up", unit: "" },
];

const state = {
  now: new Date("2026-10-11T06:00:00Z"),
  trend: { days: [], weeks, diversity: [] },
  sources: { webmaster: { searchablePages: 12, excludedPages: 3, sitemapUrls: 300, recrawlRemaining: 50 }, webmasterError: null, gsc: null, gscError: null },
  search: { impressions: 40, clicks: 3, averagePosition: 18.2, searchablePages: 12, previousImpressions: 100 },
  platforms: [{ platform: "telegram", published: 3, stalled: 1, topReason: "дубль темы" }],
  feeds: [{ platform: "telegram", lastPublishedAt: null, publishedFortnight: 20 }],
  backlinks: [],
  recentDirectives: [{ key: "k", action: "update_prompt", problem: "однотипные заголовки", appliedAt: new Date(), status: "APPLIED" }],
} as never;

const verdict = (id: string, actual: number | null) =>
  judgeKpi({ definition: AGENT_KPIS.find((k) => k.id === id)!, actual, period: "month" });

const input = {
  state,
  findings: [] as OrchestratorFinding[],
  verdicts: [verdict("seo.impressions", 40), verdict("smm.slot_fill", null)],
  planned: [] as OrchestratorDirective[],
  applied: [] as OrchestratorDirective[],
};

describe("B752 отчёты", () => {
  it("SEO: просадка на первом месте, без среза ключей Wordstat", () => {
    const text = buildSeoReport(input);
    expect(text).toContain("ПРОСАДКИ");
    expect(text).toMatch(/Показы: 100 → <b>40<\/b> \(−60 %\)/);
    expect(text).not.toMatch(/wordstat|ключев/i);
    expect(text.length).toBeLessThanOrEqual(REPORT_HARD_CAP);
  });

  it("SMM: площадки и блок «гипотеза → результат»", () => {
    const text = buildSmmReport(input);
    expect(text).toContain("telegram");
    expect(text).toMatch(/Гипотеза: однотипные заголовки/);
    expect(text).toContain("Результат:");
    expect(text.length).toBeLessThanOrEqual(REPORT_HARD_CAP);
  });

  it("находки и правки делятся по направлению", () => {
    expect(belongsTo("seo", { code: "search.coverage" } as OrchestratorFinding)).toBe(true);
    expect(belongsTo("smm", { code: "smm.duplicate_drafts" } as OrchestratorFinding)).toBe(true);
    expect(belongsTo("seo", { target: "seo" } as OrchestratorDirective)).toBe(true);
    expect(belongsTo("seo", { target: "conveyor" } as OrchestratorDirective)).toBe(false);
  });

  it("антиповтор: отпечаток не зависит от даты, а «без изменений» — одна строка", () => {
    const a = buildSeoReport(input);
    const b = buildSeoReport({ ...input, state: { ...(state as object), now: new Date("2026-10-12T06:00:00Z") } as never });
    expect(reportFingerprint(a)).toBe(reportFingerprint(b));
    expect(unchangedLine("seo", new Date()).split("\n")).toHaveLength(1);
  });
});
