import fs from "node:fs";
import path from "node:path";
import { chartFromMap, dayKey, productLabel, resolveAdminPeriod } from "@/app/admin/admin-analytics-data";

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
    expect(productLabel("seven_days")).toBe("Недельное резюме");
    expect(productLabel("seven-days")).toBe("Недельное резюме");
  });

  it("aggregates long date ranges by week so chart axes stay readable", () => {
    const days = Array.from({ length: 40 }, (_, index) => {
      const date = new Date(2026, 5, 1 + index);
      return dayKey(date);
    });
    const values = new Map(days.map((day) => [day, 1]));

    const chart = chartFromMap(days, values);

    expect(chart.length).toBeLessThan(days.length);
    expect(chart[0]).toEqual({ label: "01.06-07.06", value: 7 });
    expect(chart.at(-1)?.label).toBe("06.07-10.07");
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
    expect(currencySelector).toContain("saveAdminCurrencyPreference");
    expect(currencySelector).toContain("restoreAdminCurrencyPreference");
  });

  it("renders chart hover tooltips from the top SVG layer with readable sizing", () => {
    const ui = source("src/app/admin/admin-analytics-ui.tsx");
    const css = source("src/app/v4-soft.css");

    expect(ui).toContain("soft-chart-tooltip-layer");
    expect(ui).toContain("buildVerticalTooltipHits");
    expect(ui).toContain("buildStackedTooltipHits");
    expect(css).toContain(".soft-chart-tooltip-layer .soft-chart-hit");
    expect(css).toContain("font-size: 11px");
  });
});
