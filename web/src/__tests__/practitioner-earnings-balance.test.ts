import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

// B466: «Баланс и доходы» живёт в «Финансы → Баланс»; старый /earnings
// редиректит туда. Канонический баланс — общий с шапкой/админкой.

describe("Practitioner finance balance UX (B466)", () => {
  it("redirects the legacy earnings page into «Финансы»", () => {
    const page = source("src/app/cabinet/practitioner/earnings/page.tsx");
    expect(page).toContain('redirect(appUrl("/practitioner/finance"))');
  });

  it("uses the CANONICAL balance on the Баланс tab (matches header/admin)", () => {
    const data = source("src/app/cabinet/practitioner/finance/finance-data.ts");
    expect(data).toContain("computePractitionerBalances");
    const tab = source("src/app/cabinet/practitioner/finance/balance-tab.tsx");
    expect(tab).toContain("Доступно к выплате");
    expect(tab).not.toContain("Кошелёк кабинета");
  });

  it("keeps «Удержано» = session hold only, leading into «Движение средств»", () => {
    const tab = source("src/app/cabinet/practitioner/finance/balance-tab.tsx");
    expect(tab).toContain("Удержано");
    expect(tab).toContain("Hold по сессиям");
    // R9-5: «Движение средств» на десктопе — вкладка, а не отдельный drill-down роут
    expect(tab).toContain("/practitioner/finance?tab=movements");
    expect(tab).not.toContain("chargeback");
    const movements = source("src/app/cabinet/practitioner/finance/movements/page.tsx");
    expect(movements).toContain("Удержания");
    const data = source("src/app/cabinet/practitioner/finance/finance-data.ts");
    expect(data).toContain("Удержание по сессии");
    expect(data).toContain("снимется");
  });

  it("exposes the same available practitioner balance to the cabinet header", () => {
    const route = source("src/app/api/practitioner/balance/route.ts");
    expect(route).toContain("computePractitionerBalance");
    expect(route).toContain("currentBalanceKopecks");
    expect(route).toContain('session.user?.role !== "PRACTITIONER"');
  });
});
