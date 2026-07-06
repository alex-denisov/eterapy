import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("B207/B229 practitioner v4.2 cabinet", () => {
  it("uses real practitioner money/AI data on the cockpit surfaces", () => {
    // B466: «Сегодня» показывает реальный доход месяца из завершённых сессий с
    // применённой комиссией; канонический баланс живёт в «Финансы» (earnings).
    const page = source("src/app/cabinet/practitioner/page.tsx");
    expect(page).toContain("commissionPercentApplied");
    expect(page).toContain("getPractitionerAiQuota");
    expect(page).toContain("monthIncome.toLocaleString");
    expect(page).not.toContain("выплата в разработке");

    const financeData = source("src/app/cabinet/practitioner/finance/finance-data.ts");
    expect(financeData).toContain("computePractitionerBalances");
  });

  it("renders services and prices from practitioner rates instead of a placeholder", () => {
    const page = source("src/app/cabinet/practitioner/services/page.tsx");

    expect(page).toContain("db.practitioner.findUnique");
    expect(page).toContain("priceRates");
    expect(page).toContain("activeRates");
    // M11: the per-tariff card (incl. "Индивидуальная сессия") now lives in the
    // interactive ActiveTariffsEditor client component.
    expect(page).toContain("ActiveTariffsEditor");
    const editor = source("src/app/cabinet/practitioner/services/active-tariffs-editor.tsx");
    expect(editor).toContain("Индивидуальная сессия");
    expect(page).toContain("комиссия платформы");
    expect(page).toContain("Без скидок на встречи");
    expect(page).toContain("психология + эзотерика");
    expect(page).toContain("practitioner-acquisition-kit");
    expect(page).toContain("Личная ссылка предразбора");
    expect(page).not.toContain("будет доступно в следующем обновлении");
  });

  it("keeps cabinet navigation aligned with the approved IA", () => {
    const shell = source("src/components/cabinet/cabinet-shell.tsx");

    expect(shell).toContain('"Дневник"');
    expect(shell).toContain("soft-app-sidebar-card");
    // B466: the practitioner nav is sourced from the shared «Practice cockpit»
    // model; «Услуги и цены»/«Этический кодекс» live on under the «Ещё» hub.
    expect(shell).toContain("PRACTITIONER_TABS.map");
    const navModel = source("src/lib/nav-model.ts");
    expect(navModel).toContain('label: "Сегодня"');
    expect(navModel).toContain('appUrl("/practitioner/services")');
    expect(navModel).toContain('appUrl("/practitioner/ethics")');
  });

  it("surfaces requests and reviews with risk/compliance state", () => {
    // B466: заявки живут на «Календарь → Заявки» (requests-tab).
    const requests = source("src/app/cabinet/practitioner/calendar/requests-tab.tsx");
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
