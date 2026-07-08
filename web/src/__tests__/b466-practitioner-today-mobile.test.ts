import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

// B466 R9-4 P1 — мобильный ЛК практика 1-в-1 по макетам (шасси + «Сегодня»).
// Макет: docs/Design/mockups/practitioner-cabinet-today.html. Owner: токены/формы/
// цвета ровно из mockup-CSS; шрифты платформенные; десктоп не трогаем до R9-5.

describe("R9-4 P1 — cockpit chassis (practitioner-cockpit.css)", () => {
  const css = () => source("src/app/cabinet/practitioner-cockpit.css");

  it("carries the EXACT mockup palette under the --pc-* namespace", () => {
    const styles = css();
    for (const token of [
      "--pc-paper: #FBF6EC",
      "--pc-paper-card: #FFFFFF",
      "--pc-paper-deep: #F3E9D7",
      "--pc-paper-edge: #E7DCCB",
      "--pc-ink: #2D2A26",
      "--pc-ink-soft: #6B6258",
      "--pc-ink-faint: #9A9085",
      "--pc-bordeaux: #6E2B2B",
      "--pc-terracotta: #C2724B",
      "--pc-terracotta-dark: #B5623F",
      "--pc-amber-bg: #F2E2C2",
      "--pc-amber-ink: #6E5114",
      "--pc-sage: #E4EADF",
      "--pc-sage-ink: #4B6146",
      "--pc-cream: #FBF1E4",
      "--pc-warm: #F6E7DD",
    ]) {
      expect(styles).toContain(token);
    }
  });

  it("uses the PLATFORM fonts (Cormorant heading var), not the mockup Google fonts", () => {
    const styles = css();
    expect(styles).toContain("var(--font-heading");
    expect(styles).not.toContain("Lora");
    expect(styles).not.toContain("Geist");
  });

  it("hides the global header on mobile only on screens that own their top (data-pcab-top)", () => {
    const styles = css();
    expect(styles).toContain("body:has([data-pcab-top])");
    expect(styles).toContain('[data-site-chrome="header"]');
    expect(styles).toContain("max-width: 767px");
  });

  it("defines the mockup tabbar: opaque card, edge border, 10.5px labels, bordeaux active", () => {
    const styles = css();
    expect(styles).toContain(".pcab-tabbar");
    expect(styles).toContain(".pcab-tab");
    expect(styles).toMatch(/\.pcab-tab\s*\{[^}]*font-size:\s*10\.5px/);
    expect(styles).toMatch(/\.pcab-tab\.is-active\s*\{[^}]*var\(--pc-bordeaux\)/);
  });

  it("is loaded for every cabinet route via the cabinet layout", () => {
    expect(source("src/app/cabinet/layout.tsx")).toContain("practitioner-cockpit.css");
  });
});

describe("R9-4 P1 — PractitionerAppbar (mockup appbar block)", () => {
  it("renders avatar initials, name + tier chip, subtitle and the notification bell", () => {
    const appbar = source("src/components/cabinet/practitioner-appbar.tsx");
    expect(appbar).toContain("pcab-avatar");
    expect(appbar).toContain("pcab-tier");
    expect(appbar).toContain("pcab-appbar-sub");
    expect(appbar).toContain("NotificationBell");
    expect(appbar).toContain("pcab-iconbtn-slot");
  });
});

describe("R9-4 P1 — «Сегодня» mobile 1-в-1", () => {
  const mobile = () => source("src/app/cabinet/practitioner/practitioner-today-mobile.tsx");

  it("page splits: mobile mockup view (md:hidden) + untouched desktop (md:block)", () => {
    const page = source("src/app/cabinet/practitioner/page.tsx");
    expect(page).toContain("PractitionerTodayMobile");
    expect(page).toMatch(/className="[^"]*hidden[^"]*md:block[^"]*"/);
    expect(mobile()).toContain("md:hidden");
  });

  it("marks the screen as owning its mobile top (hides the global bell strip)", () => {
    expect(mobile()).toContain("data-pcab-top");
  });

  it("keeps the mockup section order: hero → attention → schedule → stats", () => {
    const view = mobile();
    const order = [
      "Следующая сессия",
      "Требует внимания",
      "весь день →",
      "pcab-stats",
    ];
    let cursor = -1;
    for (const marker of order) {
      const idx = view.indexOf(marker);
      expect(idx).toBeGreaterThan(cursor);
      cursor = idx;
    }
  });

  it("uses the mockup vocabulary: «Войти в сессию», «Карточка», tags «следующая»/«подтверждено»", () => {
    const view = mobile();
    expect(view).toContain("Войти в сессию");
    expect(view).toContain("Карточка");
    expect(view).toContain("запись включена");
    // Словарь тегов расписания готовит page.tsx (scheduleMobile).
    const page = source("src/app/cabinet/practitioner/page.tsx");
    expect(page).toContain('"следующая"');
    expect(page).toContain('"подтверждено"');
  });

  it("keeps the owner r8 additions after the mockup blocks: tariff CTA + «Разборы и AI»", () => {
    const view = mobile();
    const stats = view.indexOf('data-testid="pcab-stats"');
    const cta = view.indexOf('data-testid="pcab-subscription-cta"');
    const quota = view.indexOf('data-testid="pcab-ai-quota"');
    expect(stats).toBeGreaterThan(-1);
    expect(cta).toBeGreaterThan(stats);
    expect(quota).toBeGreaterThan(cta);
  });

  it("formats the greeting date weekday-first («четверг, 4 июля») like the mockup", () => {
    expect(source("src/lib/msk-time.ts")).toContain("formatMskDayLongWeekdayFirst");
    expect(source("src/app/cabinet/practitioner/page.tsx")).toContain("formatMskDayLongWeekdayFirst");
  });
});

describe("R9-4 P1 — practitioner mobile tabbar per mockup", () => {
  it("cabinet-shell applies pcab-tabbar classes for the practitioner role only", () => {
    const shell = source("src/components/cabinet/cabinet-shell.tsx");
    expect(shell).toContain("pcab-tabbar");
    expect(shell).toContain("pcab-tab");
    expect(shell).toMatch(/isPractitionerBar|role === "PRACTITIONER"/);
  });
});
