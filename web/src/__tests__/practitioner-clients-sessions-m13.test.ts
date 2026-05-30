import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("M13 — practitioner clients sessions table", () => {
  it("renders a unified sessions table instead of separate card sections", () => {
    const page = source("src/app/cabinet/practitioner/clients/page.tsx");
    expect(page).toContain("ClientsSessionsTable");
    expect(page).toContain("SessionRow");
    // old card-section headings are gone
    expect(page).not.toContain("Новые запросы");
    expect(page).not.toContain("Подтверждённые");
  });

  it("provides a status toggle, client/date filters and nearest-time default sort", () => {
    const table = source("src/app/cabinet/practitioner/clients/clients-sessions-table.tsx");
    expect(table).toContain('data-testid="practitioner-sessions-table"');
    // status toggle covers upcoming / completed / cancelled
    expect(table).toContain("Предстоящие");
    expect(table).toContain("Завершённые");
    expect(table).toContain("Отменённые");
    // filters
    expect(table).toContain("Поиск по клиенту");
    expect(table).toContain('type="date"');
    // default nearest-time sort + price/time column sorting
    expect(table).toContain('"nearest"');
    expect(table).toContain("Math.abs(ta - now) - Math.abs(tb - now)");
    expect(table).toContain("priceHeaderSort");
    // pagination over 25
    expect(table).toContain("PAGE_SIZE = 25");
  });
});
