import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const listFiles = (dir: string): string[] => {
  const absolute = path.join(process.cwd(), dir);
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(rel);
    return entry.isFile() && /\.(tsx|ts)$/.test(entry.name) ? [rel] : [];
  });
};

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

  it("lets the admin sidebar stretch with long pages instead of pinning it to viewport height", () => {
    const shell = source("src/app/admin/admin-shell.tsx");
    const sidebarMarkup = shell.slice(
      shell.indexOf('data-testid="admin-shell-sidebar"'),
      shell.indexOf('data-testid="admin-shell-user"'),
    );

    expect(sidebarMarkup).toContain("self-stretch");
    expect(sidebarMarkup).not.toContain(" sticky ");
    expect(sidebarMarkup).not.toContain('style={{ top: "var(--header-height)" }}');
  });

  it("anchors chart date labels to the corresponding bar group and keeps tooltips", () => {
    const ui = source("src/app/admin/admin-analytics-ui.tsx");
    const css = source("src/app/v4-soft.css");

    expect(ui).toContain("axisLabelY");
    expect(ui).toContain('textAnchor="middle"');
    expect(ui).toContain("vertical: false");
    expect(ui).not.toContain("rotate(-90");
    expect(ui).not.toContain("rotate(90");
    expect(ui).toContain("width={width}");
    expect(ui).toContain("height={height}");
    expect(ui).toContain("className=\"block max-w-none\"");
    expect(ui).toContain("soft-chart-tooltip");
    expect(ui).toContain("aria-label={hit.tooltip}");
    expect(ui).toContain("min-w-0 scroll-mt-24 overflow-hidden");
    expect(ui).toContain("min-w-0 max-w-full overflow-hidden");
    expect(css).toContain(".soft-chart-hit rect:hover + .soft-chart-tooltip");
  });

  it("adds an overall stacked daily product histogram before per-product charts", () => {
    const results = source("src/app/admin/product/results/page.tsx");
    const data = source("src/app/admin/admin-analytics-data.ts");

    expect(results).toContain('title="Все продукты по дням"');
    expect(results).toContain("StackedBarChart");
    expect(results).toContain('label="Все заказанные продукты по календарным дням"');
    expect(results).toContain("data.charts.productByDayStacked");
    expect(results).toContain("appUrl(`/cabinet/results/${result.id}`)");
    expect(results).not.toContain("`/api/admin/product-results/${result.id}`");
    expect(data).toContain("normalizeAdminProductKey");
    expect(data).toContain("catalogProductKeys");
    expect(data).toContain("productPlanByDay.get(normalizedProductKey)");
    expect(data).toContain("productByDay.get(day)?.get(productKey)");
  });

  it("keeps all active products in pricing and unit-economics without duplicate legacy keys", () => {
    const pricing = source("src/app/admin/pricing/pricing-editor.tsx");
    const data = source("src/app/admin/admin-analytics-data.ts");
    const unitEconomics = source("src/app/admin/finance/unit-economics/page.tsx");

    for (const product of ["tarot", "natal-chart", "synastry", "numerology", "family-scenarios", "human-design", "surname-story"]) {
      expect(pricing).toContain(`product.${product}.price`);
    }
    expect(data).toContain('"seven-days-report": "weekly-summary"');
    expect(data).toContain('"perspectives": "reframe"');
    expect(unitEconomics).toContain("productLabel(row.feature)");
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
    expect(aiCost).toContain("AdminCompactDataTable");
    expect(aiCost).toContain("modelDetailColumns");
    expect(aiCost).toContain("interactionColumns");
    expect(aiCost).not.toContain("soft-admin-table min-w");
  });

  it("keeps ops security audit rows compact and human-readable", () => {
    const security = source("src/app/admin/ops/security/page.tsx");
    const compactTable = source("src/components/admin/compact-client-table.tsx");

    expect(security).toContain("AdminCompactDataTable");
    expect(security).toContain("clientRiskColumns");
    expect(security).toContain("riskActionColumns");
    expect(security).toContain("formatAuditDetailsText");
    expect(security).toContain('key: "open", label: "Действия"');
    expect(security).toContain('kind: "details"');
    expect(compactTable).toContain('kind: "details"');
    expect(compactTable).toContain("<dialog");
    expect(security).not.toContain("<details");
    expect(security).not.toContain("Показать детали");
    expect(security).not.toContain("flex max-w-[34rem] flex-wrap");
  });

  it("uses compact tables for system service and cron lists", () => {
    const ops = source("src/app/admin/ops/page.tsx");
    const system = source("src/app/admin/system/admin-system-page.tsx");

    for (const page of [ops, system]) {
      expect(page).toContain("AdminCompactDataTable");
      expect(page).toContain("serviceColumns");
      expect(page).toContain("cronColumns");
      expect(page).not.toContain("divide-y divide-[var(--soft-paper-edge)]");
      expect(page).not.toContain("divide-y divide-border/10");
    }
  });

  it("keeps problematic admin detail actions in modal or block anchors instead of raw inline expansion", () => {
    const applications = source("src/app/admin/applications/applications-manager.tsx");
    const library = source("src/app/admin/product/quality/library-requests-manager.tsx");
    const reviews = source("src/app/admin/reviews/reviews-manager.tsx");
    const payouts = source("src/app/admin/finance/payouts/page.tsx");
    const reports = source("src/app/admin/finance/reports/page.tsx");
    const ai = source("src/app/admin/ai/ai-control-center.tsx");
    const aiCost = source("src/app/admin/ops/ai-cost/page.tsx");
    const database = source("src/app/admin/database/admin-database-page.tsx");

    expect(applications).toContain("application-detail-grid");
    expect(library).toContain("editQuestion");
    expect(library).toContain("textarea");
    expect(reviews).toContain("RATING_OPTIONS");
    expect(reviews).toContain('filterKind: "select"');
    expect(payouts).not.toContain("В таблице выводится 20 практиков на страницу");
    expect(reports).toContain("calculatedReports");
    expect(reports).toContain("booking.findMany");
    expect(ai).toContain("RoutingChainModal");
    expect(ai).toContain("provider-logo-chain");
    expect(ai).not.toContain("<details>");
    expect(aiCost).toContain('/admin/ops/ai#admin-ai-interactions');
    expect(database).toContain("const MAX_ROWS = 2000");
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

  it("uses the compact users-table pattern on high-traffic admin tables", () => {
    const compactClientTable = source("src/components/admin/compact-client-table.tsx");
    const productResults = source("src/app/admin/product/results/page.tsx");
    const productSessions = source("src/app/admin/product/sessions/page.tsx");
    const bookingsManager = source("src/app/admin/bookings/bookings-manager.tsx");
    const sessionsTable = source("src/app/admin/sessions/sessions-table.tsx");
    const libraryRequests = source("src/app/admin/product/quality/library-requests-manager.tsx");
    const financeReceipts = [
      source("src/app/admin/finance/receipts/page.tsx"),
      source("src/app/admin/finance/receipts/receipts-table.tsx"),
    ].join("\n");
    const financeReports = source("src/app/admin/finance/reports/page.tsx");
    const financePoints = source("src/app/admin/finance/points/page.tsx");
    const paymentsPanel = source("src/app/admin/payments/payments-panel.tsx");

    expect(compactClientTable).toContain("AdminCompactDataTable");
    expect(compactClientTable).toContain("filterKind");
    expect(compactClientTable).toContain("CompactPaginationBar");
    expect(compactClientTable).toContain("DateHeaderFilter");
    expect(compactClientTable).toContain("adminPeriodFromRuDate");
    expect(compactClientTable).toContain("aria-label=\"Открыть календарь фильтра\"");
    expect(compactClientTable).toContain("Выбрано:");
    expect(compactClientTable).toContain("onClick?: () => void");
    expect(compactClientTable).toContain("onBulkAction?:");
    expect(compactClientTable).toContain("onBulkAction(action.key, Array.from(selectedIds))");

    for (const page of [productResults, productSessions, financeReceipts, financeReports, financePoints]) {
      expect(page).toContain("AdminCompactDataTable");
      expect(page).not.toMatch(/import\s+\{[^}]*\bDataTable\b[^}]*\}/);
      expect(page).not.toContain("<DataTable");
      expect(page).not.toContain("<form className=\"mb-4 flex flex-wrap items-center gap-2\"");
    }

    for (const table of [bookingsManager, sessionsTable, libraryRequests, paymentsPanel]) {
      expect(table).toContain("AdminCompactDataTable");
    }

    expect(financeReceipts).toContain("onBulkAction");
    expect(financeReceipts).toContain("Проверить выбранные у провайдера");
    expect(paymentsPanel).toContain("practitionerPayoutColumns");
    expect(paymentsPanel).toContain("practitionerPayoutRows");
    expect(paymentsPanel).not.toContain("<CompactTableShell minWidth=\"980px\">");
    expect(financeReports).toContain("take: 500");
    expect(financePoints).toContain("take: 500");
  });

  it("keeps product quality operation tables on the compact table system", () => {
    const managers = [
      source("src/app/admin/complaints/complaints-manager.tsx"),
      source("src/app/admin/applications/applications-manager.tsx"),
      source("src/app/admin/product/quality/library-requests-manager.tsx"),
      source("src/app/admin/reviews/reviews-manager.tsx"),
      source("src/app/admin/antifraud/admin-antifraud-panel.tsx"),
    ];

    for (const manager of managers) {
      expect(manager.includes("AdminCompactDataTable") || manager.includes("CompactTableShell")).toBe(true);
      expect(manager).not.toContain("soft-admin-data-table");
      expect(manager).not.toContain("soft-admin-seg");
    }

    const antifraud = source("src/app/admin/antifraud/admin-antifraud-panel.tsx");
    expect(antifraud).toContain("eventColumns");
    expect(antifraud).toContain("AdminCompactDataTable");
    expect(antifraud).toContain("Заметка к решению");
    expect(antifraud).not.toContain("divide-y divide-[var(--soft-paper-edge)]");
  });

  it("does not reintroduce legacy admin table wrappers in admin pages", () => {
    const files = listFiles("src/app/admin").filter((file) => !file.includes("/api/"));
    const offenders = files.filter((file) => {
      const text = source(file);
      return /soft-admin-data-table|soft-admin-seg|soft-admin-table-filter|<DataTable\b/.test(text);
    });

    expect(offenders).toEqual([]);
  });

  it("does not keep duplicate retired admin routes as redirects or re-export aliases", () => {
    const appRoot = path.join(process.cwd(), "src/app/admin");

    expect(fs.existsSync(path.join(appRoot, "metrics/page.tsx"))).toBe(false);
    expect(fs.existsSync(path.join(appRoot, "finance/credits/page.tsx"))).toBe(false);
    expect(fs.existsSync(path.join(appRoot, "finance/transactions/page.tsx"))).toBe(false);
  });

  it("removes legacy analytics table exports so new admin pages cannot use the old style", () => {
    const ui = source("src/app/admin/admin-analytics-ui.tsx");

    expect(ui).not.toContain("export function DataTable");
    expect(ui).not.toContain("export function LinkPagination");
    expect(ui).not.toContain("linkPaginationItems");
  });
});
