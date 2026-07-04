import fs from "node:fs";
import path from "node:path";
import { chartBuckets, chartFromMap, dayKey, productLabel, resolveAdminPeriod } from "@/app/admin/admin-analytics-data";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("Admin analytics shared controls and chart data", () => {
  it("keeps calendar dates in the local Russian admin day without UTC off-by-one", () => {
    expect(dayKey(new Date(2026, 5, 2, 0, 0, 0))).toBe("2026-06-02");

    const period = resolveAdminPeriod({ start: "2026-06-02", end: "2026-06-02" });

    expect(period.startInput).toBe("2026-06-02");
    expect(period.endInput).toBe("2026-06-02");
    expect(period.days).toEqual(["2026-06-02"]);
  });

  it("renders product and AI service keys with Russian labels", () => {
    expect(productLabel("human-design")).toBe("Дизайн человека");
    expect(productLabel("Human Design")).toBe("Дизайн человека");
    expect(productLabel("product-human-design")).toBe("Дизайн человека");
    expect(productLabel("perspectives")).toBe("Переосмысление");
    expect(productLabel("product-reframe-v5")).toBe("Переосмысление");
    expect(productLabel("seven_days")).toBe("Недельное резюме");
    expect(productLabel("seven-days")).toBe("Недельное резюме");
    expect(productLabel("seven-days-report")).toBe("Недельное резюме");
  });

  it("keeps daily chart buckets for one month or less", () => {
    const days = Array.from({ length: 31 }, (_, index) => {
      const date = new Date(2026, 5, 1 + index);
      return dayKey(date);
    });
    const values = new Map(days.map((day) => [day, 1]));

    const chart = chartFromMap(days, values);

    expect(chart).toHaveLength(days.length);
    expect(chart[0]).toEqual({ label: "01.06", value: 1 });
    expect(chart.at(-1)).toEqual({ label: "01.07", value: 1 });
  });

  it("keeps daily chart buckets for long periods so date labels match bars", () => {
    const days = Array.from({ length: 40 }, (_, index) => {
      const date = new Date(2026, 5, 1 + index);
      return dayKey(date);
    });
    const values = new Map(days.map((day) => [day, 1]));

    const buckets = chartBuckets(days);
    const chart = chartFromMap(days, values);

    expect(buckets).toHaveLength(days.length);
    expect(buckets[0]).toEqual({
      label: "01.06",
      days: ["2026-06-01"],
    });
    expect(chart[0]).toEqual({ label: "01.06", value: 1 });
    expect(chart.at(-1)).toEqual({ label: "10.07", value: 1 });
  });

  it("resolves all-time periods without silently truncating days and uses monthly chart buckets", () => {
    const period = resolveAdminPeriod({ period: "all" });

    expect(period.startInput).toBe("2020-01-01");
    expect(period.days.length).toBeGreaterThan(370);

    const longDays = Array.from({ length: 430 }, (_, index) => {
      const date = new Date(2025, 0, 1 + index);
      return dayKey(date);
    });
    const values = new Map(longDays.map((day) => [day, 1]));
    const buckets = chartBuckets(longDays);
    const chart = chartFromMap(longDays, values);

    expect(buckets.length).toBeLessThan(longDays.length);
    expect(buckets[0]).toEqual(expect.objectContaining({
      label: "01.2025",
      days: expect.arrayContaining(["2025-01-01", "2025-01-31"]),
    }));
    expect(chart[0]).toEqual({ label: "01.2025", value: 31 });
  });

  it("persists admin period and currency across sidebar navigation", () => {
    const shell = source("src/app/admin/admin-shell.tsx");
    const periodToolbar = source("src/app/admin/admin-period-toolbar.tsx");
    const currencySelector = source("src/app/admin/admin-currency-selector.tsx");

    expect(shell).toContain("useAdminNavigationHref");
    expect(shell).toContain("ADMIN_PERIOD_STORAGE_KEY");
    expect(shell).toContain("ADMIN_CURRENCY_STORAGE_KEY");
    expect(periodToolbar).toContain("saveAdminPeriodPreference");
    expect(periodToolbar).toContain("restoreAdminPeriodPreference");
    expect(periodToolbar).toContain('["all", "Все время"]');
    expect(currencySelector).toContain("saveAdminCurrencyPreference");
    expect(currencySelector).toContain("restoreAdminCurrencyPreference");
  });

  it("renders chart-kit charts with readable tooltips, PowerBI-like axes, and approved palette", () => {
    const ui = source("src/app/admin/admin-analytics-ui.tsx");
    const css = source("src/app/v4-soft.css");

    expect(ui).toContain("CHART_KIT_PALETTE");
    expect(ui).toContain("#2563EB");
    expect(ui).toContain("#14B8A6");
    expect(ui).toContain("soft-chart-grid-line");
    expect(ui).toContain("soft-chart-axis-label");
    expect(ui).toContain("shapeRendering=\"geometricPrecision\"");
    expect(ui).toContain("soft-chart-tooltip-layer");
    expect(ui).toContain("buildVerticalTooltipHits");
    expect(ui).toContain("buildStackedTooltipHits");
    expect(ui).toContain("axisSlotWidth");
    expect(ui).toContain("tooltipSize");
    expect(ui).not.toContain("Math.min(280");
    expect(ui).not.toContain("Math.min(300");
    expect(css).toContain(".soft-chart-tooltip-layer .soft-chart-hit");
    expect(css).toContain("filter: drop-shadow");
    expect(css).toContain("font-size: 12px");
  });
});
