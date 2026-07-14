import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

// B466 R9-4 P4 — мобильный «Финансы» кокпита практика 1-в-1 по mockups
//   practitioner-finance-balance / -tariff / -requisites(+locked) / -reports.html.
// Owner: дизайн 1-в-1 (токены/формы/цвета из mockup-CSS, платформенные шрифты);
// НЕ копируем старые страницы; десктоп не трогаем до R9-5 (hidden md:block,
// серверные загрузчики переиспользуются). Логика оплаты тарифа — общий хук
// (десктоп + мобайл), эндпоинты прежние.

const FIN = "src/app/cabinet/practitioner/finance";

describe("R9-4 P4 — cockpit CSS: finance primitives (mockup-exact)", () => {
  const css = () => source("src/app/cabinet/practitioner-cockpit.css");

  it("defines the balance money-hero, held row and metrics", () => {
    const styles = css();
    expect(styles).toMatch(/\.pcab-money\s*\{[^}]*border-radius:\s*20px/);
    expect(styles).toContain(".pcab-money::before");
    expect(styles).toContain(".pcab-heldrow");
    expect(styles).toContain(".pcab-metrics");
    expect(styles).toContain(".pcab-mv-amt.pos");
    expect(styles).toContain(".pcab-mrow-v");
  });

  it("defines the tariff commission hero, plan cards and plan buttons", () => {
    const styles = css();
    expect(styles).toMatch(/\.pcab-comm\s*\{[^}]*background:\s*var\(--pc-bordeaux\)/);
    expect(styles).toContain(".pcab-plan.current");
    expect(styles).toContain(".pcab-plan.upsell");
    expect(styles).toContain(".pcab-ribbon");
    expect(styles).toContain(".pcab-cstrip");
    expect(styles).toContain(".pcab-planbtn-primary");
    expect(styles).toContain(".pcab-byoc");
  });

  it("defines the requisites method card, locked warn and needs-chip", () => {
    const styles = css();
    expect(styles).toContain(".pcab-method");
    expect(styles).toContain(".pcab-addcard");
    expect(styles).toContain(".pcab-fwarn");
    expect(styles).toContain(".pcab-disabledadd");
    expect(styles).toContain(".pcab-needchip");
    expect(styles).toContain(".pcab-row-ic.sage");
  });

  it("keeps platform fonts — no mockup Google fonts leak into the finance section", () => {
    const styles = css();
    // .pcab-money-v / .pcab-comm-v / .pcab-plan-name must use the platform heading font.
    expect(styles).toMatch(/\.pcab-money-v\s*\{[^}]*font-family:\s*var\(--font-heading\)/);
    expect(styles).toMatch(/\.pcab-comm-v\s*\{[^}]*font-family:\s*var\(--font-heading\)/);
    expect(styles).not.toContain("Lora");
    expect(styles).not.toContain("Geist");
  });
});

describe("R9-4 P4 — finance page renders mobile + hidden desktop", () => {
  const page = () => source(`${FIN}/page.tsx`);

  it("renders the mobile cockpit shell and hides the previous desktop tree", () => {
    const src = page();
    expect(src).toContain("FinanceMobileShell");
    expect(src).toContain("hidden");
    expect(src).toMatch(/md:block/);
    // прежний десктоп-testid сохранён (для существующих проверок)
    expect(src).toContain('data-testid="practitioner-finance-page"');
  });

  it("loads appbar data and reuses balance data for both trees (single load)", () => {
    const src = page();
    expect(src).toContain("loadPractitionerAppbar");
    // R9-5: финанс-данные грузятся один раз для Баланса и Отчётов (byMonth)
    expect(src).toContain('tab === "balance" || tab === "reports" ? await loadPractitionerFinance');
    // баланс отдаётся и мобильному, и десктопному компоненту из одной переменной
    expect(src).toContain("<FinanceBalanceMobile data={financeData}");
    expect(src).toContain("<BalanceTab data={financeData}");
  });

  it("wires all four mobile tabs", () => {
    const src = page();
    expect(src).toContain("<FinanceBalanceMobile");
    expect(src).toContain("<FinanceTariffMobile");
    expect(src).toContain("<FinanceRequisitesMobile");
    expect(src).toContain("<FinanceReportsMobile");
  });
});

describe("R9-4 P4 — mobile finance body (finance-mobile.tsx)", () => {
  const mobile = () => source(`${FIN}/finance-mobile.tsx`);

  it("shell is a data-pcab-top screen with a 4-item segment linking every tab", () => {
    const src = mobile();
    expect(src).toContain("data-pcab-top");
    expect(src).toContain('className="pcab-screen md:hidden"');
    expect(src).toContain("FINANCE_TABS.map");
    expect(src).toContain("pcab-seg-item");
  });

  it("balance shows the money hero, held row → holds filter, and by-month", () => {
    const src = mobile();
    expect(src).toContain("Доступно к выплате");
    expect(src).toContain("pcab-money-v");
    expect(src).toContain("/practitioner/finance/movements?filter=holds");
    expect(src).toContain("pcab-mrow");
  });

  it("requisites renders the locked warn when tax is not verified, method card otherwise", () => {
    const src = mobile();
    expect(src).toContain("practitioner-requisites-locked-mobile");
    expect(src).toContain("Добавление платёжного средства недоступно");
    expect(src).toContain("Заполнить ИНН");
    expect(src).toContain("pcab-method"); // verified branch
    // owner: показывать ПОЛНЫЙ ИНН
    expect(src).toContain("ИНН {data.inn}");
  });

  it("reports lists acts with an accepted/issued chip — no fake PDF download", () => {
    const src = mobile();
    expect(src).toContain("Акты выполненных работ");
    expect(src).toMatch(/принят|выпущен/);
    expect(src).not.toContain("Download");
    expect(src).not.toContain("Скачать");
  });
});

describe("R9-4 P4 — mobile tariff (shared actions hook, cleaned perks)", () => {
  const plans = () => source(`${FIN}/tariff-plans-mobile.tsx`);
  const hook = () => source(`${FIN}/use-tariff-plan-actions.ts`);
  const desktopPlans = () => source(`${FIN}/tariff-plans.tsx`);

  it("mobile and desktop plan cards share the one actions hook (no duplicated fetch)", () => {
    expect(plans()).toContain("useTariffPlanActions");
    expect(desktopPlans()).toContain("useTariffPlanActions");
    // десктоп больше не держит собственные обработчики оплаты
    expect(desktopPlans()).not.toContain('fetch("/api/practitioner/subscriptions/start-from-earnings"');
  });

  it("hook keeps the existing payment/cancel endpoints", () => {
    const src = hook();
    expect(src).toContain("/api/practitioner/subscriptions/start-from-earnings");
    expect(src).toContain("/api/billing/create-payment");
    expect(src).toContain("/api/billing/subscriptions");
  });

  it("mobile tariff drops stale export promises (owner R9-5) and keeps pay CTAs", () => {
    const src = plans();
    expect(src).not.toContain("экспорт PDF");
    expect(src).not.toContain("Массовый экспорт");
    expect(src).not.toContain("DOCX");
    expect(src).not.toContain("EHR");
    expect(src).toContain("С баланса");
    expect(src).toContain("Картой");
    expect(src).toContain("practitioner-tariff-confirm-mobile");
  });

  it("commission hero + byoc lever use live commission constants", () => {
    const src = source(`${FIN}/finance-tariff-mobile.tsx`);
    expect(src).toContain("pcab-comm");
    expect(src).toContain("PLATFORM_COMMISSION_BY_TIER");
    expect(src).toContain("BYOC_LADDER");
    expect(src).toContain("FOUNDING_FLAT_COMMISSION");
  });
});
