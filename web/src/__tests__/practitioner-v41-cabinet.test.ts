import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("B207 practitioner v4.1 cabinet", () => {
  it("uses real practitioner payout balance on the dashboard", () => {
    const page = source("src/app/cabinet/practitioner/page.tsx");

    expect(page).toContain("computePractitionerBalance");
    expect(page).toContain('data-testid="practitioner-pro-usage"');
    expect(page).toContain('data-testid="practitioner-compliance-notices"');
    expect(page).toContain("db.userSubscription.findFirst");
    expect(page).toContain("db.videoSession.count");
    expect(page).toContain("complianceRiskScore");
    expect(page).toContain("db.payout.count");
    expect(page).toContain("currentBalance.toLocaleString");
    expect(page).toContain("pendingPayout.toLocaleString");
    expect(page).toContain("открыть выплаты");
    expect(page).not.toContain("выплата в разработке");
  });

  it("renders services and prices from practitioner rates instead of a placeholder", () => {
    const page = source("src/app/cabinet/practitioner/services/page.tsx");

    expect(page).toContain("db.practitioner.findUnique");
    expect(page).toContain("priceRates");
    expect(page).toContain("activeRates");
    expect(page).toContain("Индивидуальная сессия");
    expect(page).toContain("комиссия платформы");
    expect(page).toContain("Без скидок на встречи");
    expect(page).toContain('mainUrl("/joint")');
    expect(page).toContain("practitioner-acquisition-kit");
    expect(page).toContain("Личная ссылка предразбора");
    expect(page).not.toContain("будет доступно в следующем обновлении");
  });

  it("keeps cabinet navigation aligned with v4.1 labels", () => {
    const shell = source("src/components/cabinet/cabinet-shell.tsx");

    expect(shell).toContain('"История разборов"');
    expect(shell).toContain('"Услуги и цены"');
    expect(shell).toContain('"Этический кодекс"');
    expect(shell).toContain("soft-app-sidebar-card");
  });

  it("surfaces requests and reviews with risk/compliance state", () => {
    const requests = source("src/app/cabinet/practitioner/requests/page.tsx");
    const reviews = source("src/app/cabinet/practitioner/reviews/page.tsx");

    expect(requests).toContain('data-testid="practitioner-requests-page"');
    expect(requests).toContain('data-testid="practitioner-request-card"');
    expect(requests).toContain("BookingActions");
    expect(requests).toContain("riskScore");
    expect(requests).toContain("riskFlags");
    expect(reviews).toContain('data-testid="practitioner-review-compliance"');
    expect(reviews).toContain('r.status !== "PUBLISHED"');
    expect(reviews).toContain("riskScore");
    expect(reviews).toContain("riskFlags");
  });
});
