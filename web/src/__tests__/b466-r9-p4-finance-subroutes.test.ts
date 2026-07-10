import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

// B466 R9-4 P4-детали — мобильные sub-routes «Финансы» 1-в-1 по mockups
//   practitioner-finance-movements / -receipts / -tax-status(+confirm) /
//   -requisites-edit.html.
// Паттерн P4: page.tsx рендерит мобильный экран (pcab-screen md:hidden,
// data-pcab-top, топбар назад·титул) + прежний десктоп (hidden md:block);
// серверные загрузчики и клиентские обработатчики (lookup/confirm/save)
// переиспользуются через variant="pcab" — НЕ копии старых страниц.

const FIN = "src/app/cabinet/practitioner/finance";

describe("R9-4 P4-детали — Движение средств (movements)", () => {
  const page = () => source(`${FIN}/movements/page.tsx`);

  it("renders a data-pcab-top mobile screen with topbar + filter chips + month list", () => {
    const src = page();
    expect(src).toContain('className="pcab-screen md:hidden"');
    expect(src).toContain("data-pcab-top");
    expect(src).toContain("pcab-topbar");
    expect(src).toContain("Движение средств");
    expect(src).toContain('data-testid="movements-filters-mobile"');
    expect(src).toContain("pcab-chip"); // фильтры Все/Зачисления/Выплаты/Удержания
    expect(src).toContain("pcab-mv"); // строки движения (in/out/hold)
  });

  it("keeps the previous desktop tree hidden below md and reuses the loader", () => {
    const src = page();
    expect(src).toMatch(/hidden[^"]*md:block/);
    expect(src).toContain('data-testid="practitioner-finance-movements"');
    expect(src).toContain("loadPractitionerFinance"); // тот же серверный загрузчик
  });
});

describe("R9-4 P4-детали — Чеки (receipts)", () => {
  const page = () => source(`${FIN}/receipts/page.tsx`);

  it("renders a mobile screen with month summary, receipt rows and the Мой налог link", () => {
    const src = page();
    expect(src).toContain('data-testid="practitioner-finance-receipts-mobile"');
    expect(src).toContain("data-pcab-top");
    expect(src).toContain('data-testid="receipts-summary-mobile"');
    expect(src).toContain("pcab-rc"); // строка чека
    expect(src).toContain("сформирован");
    expect(src).toContain("Открыть в «Мой налог»");
    expect(src).toContain("https://lknpd.nalog.ru/");
  });

  it("keeps the desktop tree hidden below md — no fake receipt PDF", () => {
    const src = page();
    expect(src).toMatch(/hidden[^"]*md:block/);
    expect(src).toContain('data-testid="practitioner-finance-receipts"');
    expect(src).not.toContain("Скачать");
    expect(src).not.toContain("Download");
  });
});

describe("R9-4 P4-детали — Налоговый статус (+confirm)", () => {
  const page = () => source(`${FIN}/tax-status/page.tsx`);
  const form = () => source(`${FIN}/tax-status/tax-status-form.tsx`);

  it("page renders a mobile topbar screen with the pcab form and hides desktop", () => {
    const src = page();
    expect(src).toContain('data-testid="practitioner-tax-status-mobile"');
    expect(src).toContain("data-pcab-top");
    expect(src).toContain('variant="pcab"');
    expect(src).toMatch(/hidden[^"]*md:block/);
    expect(src).toContain('data-testid="practitioner-tax-status-page"'); // прежний десктоп-testid
  });

  it("form pcab branch shares lookup/confirm handlers and renders the ФНС confirm sheet", () => {
    const src = form();
    expect(src).toContain('variant?: "desktop" | "pcab"');
    expect(src).toContain('if (variant === "pcab")');
    // общие обработчики (не дубли): один lookup/confirm на оба варианта
    expect(src).toContain("async function lookup");
    expect(src).toContain("async function confirm");
    // лист «Это действительно Вы?»
    expect(src).toContain('data-testid="practitioner-tax-confirm-mobile"');
    expect(src).toContain("pcab-sheet-wrap");
    expect(src).toContain("Это действительно Вы?");
    expect(src).toContain('data-testid="practitioner-tax-confirm-yes-mobile"');
    // 3-колоночный сегмент статуса
    expect(src).toContain('data-testid="tax-status-seg-mobile"');
  });
});

describe("R9-4 P4-детали — Реквизиты-edit (requisites-edit)", () => {
  const page = () => source(`${FIN}/requisites/edit/page.tsx`);
  const form = () => source(`${FIN}/requisites/edit/requisites-edit-form.tsx`);

  it("page renders a mobile topbar screen with the pcab form and hides desktop", () => {
    const src = page();
    expect(src).toContain('data-testid="practitioner-requisites-edit-mobile"');
    expect(src).toContain("data-pcab-top");
    expect(src).toContain('variant="pcab"');
    expect(src).toMatch(/hidden[^"]*md:block/);
    expect(src).toContain('data-testid="practitioner-requisites-edit-page"');
  });

  it("form pcab branch shares the save handler, covers card/SBP and entity fields", () => {
    const src = form();
    expect(src).toContain('variant?: "desktop" | "pcab"');
    expect(src).toContain('if (variant === "pcab")');
    expect(src).toContain("async function save");
    expect(src).toContain('data-testid="requisites-method-seg-mobile"'); // Карта / СБП
    expect(src).toContain('data-testid="practitioner-requisites-save-mobile"');
    // тот же эндпоинт, что и десктоп
    expect(src).toContain('fetch("/api/practitioner/payout-details"');
  });
});

describe("R9-4 P4-детали — cockpit CSS primitives (mockup-exact, platform fonts)", () => {
  const css = () => source("src/app/cabinet/practitioner-cockpit.css");

  it("defines the receipts summary, receipt row and open-app button", () => {
    const styles = css();
    expect(styles).toContain(".pcab-summary");
    expect(styles).toContain(".pcab-rc-amt");
    expect(styles).toContain(".pcab-rc-st");
    expect(styles).toContain(".pcab-openapp");
    // hold «на удержании» под суммой движения
    expect(styles).toContain(".pcab-mv-amt small");
  });

  it("defines the tax confirm sheet card, cancel button and switch note", () => {
    const styles = css();
    expect(styles).toContain(".pcab-idcard");
    expect(styles).toContain(".pcab-idbadge");
    expect(styles).toContain(".pcab-sheet-cancel");
    expect(styles).toContain(".pcab-fnsnote");
    expect(styles).toContain(".pcab-switchnote");
    expect(styles).toContain(".pcab-fhint");
  });

  it("uses platform tokens/fonts — no mockup Google fonts, receipt amount is heading font", () => {
    const styles = css();
    expect(styles).toMatch(/\.pcab-rc-amt\s*\{[^}]*font-family:\s*var\(--font-heading\)/);
    expect(styles).toContain("var(--pc-sage-ink)");
    expect(styles).not.toContain("Lora");
    expect(styles).not.toContain("Geist");
  });
});
