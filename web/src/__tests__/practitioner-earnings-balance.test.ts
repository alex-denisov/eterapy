import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("Practitioner earnings balance UX", () => {
  it("renames earnings to a balance page and separates cabinet balance from payouts", () => {
    const page = source("src/app/cabinet/practitioner/earnings/page.tsx");
    expect(page).toContain("Баланс и доходы");
    expect(page).toContain("Баланс кабинета");
    expect(page).toContain("К выплате");
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
});
