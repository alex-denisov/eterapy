import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("Practitioner earnings balance UX", () => {
  it("renames earnings to a balance page; the client ₽ cabinet wallet is gone (Z1-Ф2)", () => {
    const page = source("src/app/cabinet/practitioner/earnings/page.tsx");
    expect(page).toContain("Баланс и доходы");
    // Z1-Ф1/Ф2: the client ₽ balance rail is removed — only the practitioner
    // payout balance («Доступно к выплате») remains; the «Кошелёк кабинета» is gone.
    expect(page).not.toContain("Кошелёк кабинета");
    expect(page).toContain("Доступно к выплате");
    // X5: the page must use the CANONICAL balance (incl. internalCharges) so its
    // «к выплате» matches the header/admin — not the local accruedNet formula.
    expect(page).toContain("computePractitionerBalances");
    expect(page).not.toContain("Баланс, движение средств и предстоящие выплаты. Комиссия платформы");
  });

  it("renders movement history as a searchable sortable paginated table", () => {
    const table = source("src/app/cabinet/practitioner/earnings/earnings-movements-table.tsx");
    expect(table).toContain("const PAGE_SIZE = 25");
    expect(table).toContain("practitioner-earnings-movements-table");
    expect(table).toContain("practitioner-earnings-search");
    expect(table).toContain("practitioner-earnings-sort");
    expect(table).toContain("practitioner-earnings-filter-");
  });

  it("exposes the same available practitioner balance to the cabinet header", () => {
    const route = source("src/app/api/practitioner/balance/route.ts");
    expect(route).toContain("computePractitionerBalance");
    expect(route).toContain("currentBalanceKopecks");
    expect(route).toContain('session.user?.role !== "PRACTITIONER"');
  });
});
