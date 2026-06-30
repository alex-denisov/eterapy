import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("Superadmin redesign regression guardrails", () => {
  it("removes non-functional calculated placeholders from product users headers", () => {
    const users = source("src/app/admin/users/users-control-panel.tsx");

    expect(users).not.toContain("расчетное");
    expect(users).toContain("HeaderCell");
    expect(users).toContain("HeaderDateFilter");
  });

  it("keeps nested sidebar activity exact by route segment, not prefix", () => {
    const shell = source("src/app/admin/admin-shell.tsx");

    expect(shell).toContain("activePathname.startsWith(`${itemPath}/`)");
    expect(shell).not.toContain("activePathname.startsWith(itemPath)");
  });

  it("anchors chart date labels to the corresponding bar group and keeps tooltips", () => {
    const ui = source("src/app/admin/admin-analytics-ui.tsx");
    const css = source("src/app/v4-soft.css");

    expect(ui).toContain("axisLabelY");
    expect(ui).toContain('textAnchor="middle"');
    expect(ui).not.toContain("rotate(-90");
    expect(ui).toContain("soft-chart-tooltip");
    expect(ui).toContain("aria-label={tooltip}");
    expect(ui).toContain("min-w-0 scroll-mt-24 overflow-hidden");
    expect(ui).toContain("min-w-0 max-w-full overflow-hidden");
    expect(css).toContain(".soft-chart-hit rect:hover + .soft-chart-tooltip");
  });

  it("adds an overall stacked daily product histogram before per-product charts", () => {
    const results = source("src/app/admin/product/results/page.tsx");

    expect(results).toContain('title="Все продукты по дням"');
    expect(results).toContain("StackedBarChart");
    expect(results).toContain('label="Все заказанные продукты по календарным дням"');
    expect(results).toContain("data.charts.productByDayStacked");
  });

  it("loads AI cost details for the selected date range and renders uniform compact tables", () => {
    const aiCost = source("src/app/admin/ops/ai-cost/page.tsx");
    const usage = source("src/lib/ai-gateway/usage.ts");
    const interactions = source("src/lib/ai-gateway/interactions.ts");

    expect(usage).toContain("getAIUsageDetailsForRange");
    expect(interactions).toContain("start?: Date");
    expect(aiCost).toContain("getAIUsageDetailsForRange");
    expect(aiCost).toContain("listAdminAIInteractions");
    expect(aiCost).toContain("usageDetails");
    expect(aiCost).toContain("CompactTableShell");
    expect(aiCost).not.toContain("soft-admin-table min-w");
  });

  it("keeps ops security audit rows compact and human-readable", () => {
    const security = source("src/app/admin/ops/security/page.tsx");

    expect(security).toContain("CompactTableShell");
    expect(security).toContain("CompactHeader");
    expect(security).toContain("<details");
    expect(security).toContain("Показать детали");
    expect(security).not.toContain("flex max-w-[34rem] flex-wrap");
  });

  it("updates practitioner rights labels for the redesigned practitioner operations", () => {
    const display = source("src/app/admin/users/user-display.ts");
    const perms = source("src/lib/moderator-permissions.ts");

    expect(perms).toContain('"practitioners.manage_reports"');
    expect(perms).toContain('"practitioners.manage_documents"');
    expect(display).toContain("Отчёты практиков");
    expect(display).toContain("Документы и KYC");
    expect(display).toContain("Тарифы, цены и комиссия");
  });
});
