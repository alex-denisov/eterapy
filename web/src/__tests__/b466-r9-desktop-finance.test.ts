import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

// B466 R9-5 desktop — «Финансы» полный -v2 (owner ROUND 4 #3): десктоп-сегмент
// 6 вкладок Баланс·Тариф·Реквизиты·Движение·Отчёты·Чеки; Движение/Чеки —
// отдельные десктоп-вкладки (мобильный набор из 4 не тронут); Отчёты со
// скачиванием XLSX/CSV через реальный эндпоинт; byMonth несёт стабильный ключ.

const FIN = "src/app/cabinet/practitioner/finance";

describe("R9-5 desktop finance — 6-tab segment, mobile 4-tab kept", () => {
  const tabs = () => source(`${FIN}/finance-tabs.tsx`);

  it("desktop segment lists all 6 tabs in the approved order", () => {
    const src = tabs();
    // Порядок проверяем внутри десктопного массива (в мобильном FINANCE_TABS
    // отсутствуют movements/receipts, поэтому глобальный indexOf сбивал бы сортировку).
    const block = src.slice(src.indexOf("FINANCE_DESKTOP_TABS"));
    const order = ["balance", "tariff", "requisites", "movements", "reports", "receipts"];
    const idx = order.map((k) => block.indexOf(`key: "${k}"`));
    expect(idx.every((i) => i >= 0)).toBe(true);
    expect([...idx]).toEqual([...idx].sort((a, b) => a - b)); // строго по порядку макета
    expect(src).toContain("FINANCE_DESKTOP_TABS");
    // мобильный набор из 4 вкладок не расширяем (Движение/Чеки — drill-down на мобиле)
    expect(src).toContain("FINANCE_TABS");
    expect(src).toContain("soft-select-pill");
    expect(src).not.toContain("bg-primary/15 text-primary");
  });

  it("desktop FinanceTabs maps the 6-tab desktop list, not the mobile one", () => {
    expect(tabs()).toContain("FINANCE_DESKTOP_TABS.map");
  });
});

describe("R9-5 desktop finance — page wires movements/receipts tabs + report byMonth", () => {
  const page = () => source(`${FIN}/page.tsx`);

  it("TAB_KEYS covers all 6 desktop tabs; mobile coerces to a 4-tab set", () => {
    const src = page();
    for (const key of ["balance", "tariff", "requisites", "movements", "reports", "receipts"]) {
      expect(src).toContain(`"${key}"`);
    }
    expect(src).toContain("MOBILE_TAB_KEYS");
    expect(src).toContain("mobileTab");
  });

  it("renders the new tab components and passes byMonth to ReportsTab", () => {
    const src = page();
    expect(src).toContain("<MovementsTab");
    expect(src).toContain("<ReceiptsTab");
    expect(src).toContain("byMonth={financeData.byMonth}");
    expect(src).toContain("loadPractitionerFinance");
  });
});

describe("R9-5 desktop finance — Движение tab", () => {
  const mv = () => source(`${FIN}/movements-tab.tsx`);

  it("reuses the finance loader and links filters to ?tab=movements", () => {
    const src = mv();
    expect(src).toContain("loadPractitionerFinance");
    expect(src).toContain('data-testid="practitioner-finance-movements-tab"');
    expect(src).toContain("/practitioner/finance?tab=movements");
    // фильтры включая удержания (owner round-2 #1 — холды живут в Движении)
    expect(src).toContain('label: "Удержания"');
    expect(src).toContain("normalizeMovementsFilter");
  });
});

describe("R9-5 desktop finance — Чеки tab (honest, no fake receipt №)", () => {
  const rc = () => source(`${FIN}/receipts-tab.tsx`);

  it("gates on self-employed, uses «сессия №» (no fabricated receipt number)", () => {
    const src = rc();
    expect(src).toContain('data-testid="practitioner-finance-receipts-tab"');
    expect(src).toContain("SELF_EMPLOYED");
    expect(src).toContain("сессия №");
    expect(src).not.toMatch(/Чек №\d/); // без выдуманного номера чека
    expect(src).toContain("lknpd.nalog.ru"); // «Мой налог»
  });
});

describe("R9-5 desktop finance — Отчёты со скачиванием XLSX/CSV", () => {
  const reports = () => source(`${FIN}/reports-tab.tsx`);
  const route = () => source("src/app/api/practitioner/finance/export/route.ts");

  it("Отчёты list period rows with real XLSX + CSV download links, акты kept", () => {
    const src = reports();
    expect(src).toContain("Отчёты по периодам");
    expect(src).toContain('"/api/practitioner/finance/export"');
    expect(src).toContain("?period=${m.key}&format=xlsx");
    expect(src).toContain("format=csv");
    expect(src).toContain('data-testid="finance-report-xlsx"');
    // акты выполненных работ остаются (законодательно обязательный документ)
    expect(src).toContain("Акты выполненных работ");
    expect(src).toMatch(/принят|выпущен/);
  });

  it("export endpoint is practitioner-gated and produces xlsx + csv", () => {
    const src = route();
    expect(src).toContain('import { createXlsxExport } from "@/lib/xlsx-export"');
    expect(src).toContain('role !== "PRACTITIONER"');
    expect(src).toContain("await createXlsxExport");
    expect(src).toContain("text/csv");
    expect(src).toContain('status: "COMPLETED"');
    expect(src).toContain("\\d{4}-\\d{2}"); // фильтр ?period=YYYY-MM по MSK-месяцу
  });
});

describe("R9-5 desktop finance — byMonth carries a stable period key", () => {
  it("finance-data byMonth exposes YYYY-MM key + gross for report export", () => {
    const src = source(`${FIN}/finance-data.ts`);
    expect(src).toContain("isoMonthKey");
    expect(src).toContain("key: string");
    expect(src).toContain("gross: number");
  });
});

describe("R9-5 desktop finance — mobile drill-down routes preserved", () => {
  it("movements + receipts drill-down pages still exist for the mobile flow", () => {
    expect(fs.existsSync(path.join(process.cwd(), `${FIN}/movements/page.tsx`))).toBe(true);
    expect(fs.existsSync(path.join(process.cwd(), `${FIN}/receipts/page.tsx`))).toBe(true);
    expect(source(`${FIN}/movements/page.tsx`)).toContain('data-testid="practitioner-finance-movements-mobile"');
  });
});
