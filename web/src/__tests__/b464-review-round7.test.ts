import fs from "node:fs";
import path from "node:path";

// B464 round-7 — owner PROD re-review 2026-07-04 (8 items). Source assertions
// per project convention: grep the shipped source for load-bearing fragments.

const root = process.cwd();
function read(rel: string): string {
  return fs.readFileSync(path.join(root, "src", rel), "utf8");
}

// ── item 1 · «Все разборы» links to the Дневник + hide is reversible in place ──
describe("R7 item 1 — home result feed: right link + reversible hide", () => {
  it("«Все разборы» points at /diary, not the orphan /questions page", () => {
    const home = read("app/cabinet/page.tsx");
    expect(home).toContain('href={appUrl("/diary")}');
    expect(home).not.toContain('appUrl("/questions")');
  });

  it("hiding a разбор stays reversible", () => {
    // B602: строки разборов сняты с Главной. Обратимость скрытия живёт в
    // «Дневнике»: скрытые не исчезают, их видно по «Показать скрытые (N)».
    const diary = read("app/cabinet/diary/page.tsx");
    expect(diary).toContain("Показать скрытые");
    expect(diary).toContain("Показать активные");
  });
});

// ── item 2 · login fits the first mobile screen ──────────────────────────────
describe("R7 item 2 — login page fits the first mobile screen", () => {
  it("top-aligns the card on mobile and trims the card padding", () => {
    const login = read("app/(auth)/login/page.tsx");
    // top-align on mobile, centre only from sm up
    expect(login).toContain("items-start");
    expect(login).toContain("sm:items-center");
    // responsive card padding, no fixed 2rem inline block
    expect(login).toContain('className="soft-card p-6 sm:p-8"');
    expect(login).not.toContain('style={{ padding: "2rem" }}');
  });
});

// ── item 3 (A2) · bottom nav clears the iPhone home indicator ─────────────────
describe("R7 item 3 — mobile bottom bar respects the safe-area inset", () => {
  it("the frosted bar reserves env(safe-area-inset-bottom)", () => {
    const css = read("app/v4-soft.css");
    const bar = css.slice(css.indexOf(".soft-app-mobile-nav"));
    expect(bar.slice(0, 800)).toContain("padding-bottom: env(safe-area-inset-bottom, 0px)");
  });

  it("the cabinet main reserves the bar height + inset so nothing hides behind it", () => {
    const shell = read("components/cabinet/cabinet-shell.tsx");
    expect(shell).toContain("pb-[calc(5rem+env(safe-area-inset-bottom,0px))]");
  });

  it("the cabinet mobile top collapses to bell-only for client + practitioner (B466 round-8 #7)", () => {
    const header = read("components/header.tsx");
    expect(header).toContain("const cabinetMobileBellOnly = isAppArea && isAuthenticated && !isStaff");
    // brand logo hidden below md inside the cabinet
    expect(header).toContain('cabinetMobileBellOnly && "hidden md:flex"');
    // account pill hidden below md inside the cabinet (both roles)
    expect(header).toContain('className={cabinetMobileBellOnly ? "hidden md:flex" : undefined}');
  });
});

// ── item 4 · Дневник разбор rows match the mockup ────────────────────────────
describe("R7 item 4 — diary разбор rows adopt the card-row + icon cluster", () => {
  it("uses .soft-diary-row cards with a topic-chip and icon-action cluster", () => {
    const diary = read("app/cabinet/diary/page.tsx");
    const css = read("app/v4-soft.css");
    expect(diary).toContain("soft-diary-row");
    expect(diary).toContain("soft-result-chip");
    expect(diary).toContain("soft-result-acts");
    expect(css).toContain(".soft-diary-row {");
    expect(css).toContain(".soft-diary-row-foot {");
    // secondary actions (save / library-consent) are preserved in the footer
    expect(diary).toContain("soft-diary-row-foot");
    expect(diary).toContain("grantLibraryConsent");
    expect(diary).toContain("saveMapItem");
  });
});

// ── item 5 · one consistent heading scale (kills the «ёлочка») ────────────────
describe("R7 item 5 — cabinet heading hierarchy is consistent", () => {
  it("the wallet balance hero drops the crooked icon-beside-number for a clean figure", () => {
    const wallet = read("app/cabinet/wallet/page.tsx");
    expect(wallet).toContain("function pointsWord(");
    expect(wallet).toContain("Пополнить кошелёк");
    // no oversized 36px number, and the circular Wallet icon tile is gone
    expect(wallet).not.toContain("text-4xl");
    expect(wallet).not.toContain("<Wallet ");
  });

  it("wallet + billing section heads all use soft-h3 (no soft-h2, no bare-eyebrow heads)", () => {
    const wallet = read("app/cabinet/wallet/page.tsx");
    const billing = read("components/cabinet/billing-panel.tsx");
    // «Дозаправить кошелёк» demoted from soft-h2 to soft-h3
    expect(wallet).toContain('<h2 className="soft-h3 mt-1">Дозаправить кошелёк</h2>');
    expect(wallet).not.toContain("soft-h2");
    // B602: блок «Карты» удалён владельцем; заголовок истории остался soft-h3.
    expect(billing).not.toContain('<h3 className="soft-h3">Карты</h3>');
    expect(billing).toContain('<h3 className="soft-h3">История платежей</h3>');
    // plan name no longer an ad-hoc inline 28px size
    expect(billing).not.toContain("fontSize: 28");
    expect(billing).toContain('<div className="soft-h3 mt-2">{plan.name}</div>');
  });

  it("the settings page title matches every other cabinet page (soft-h1)", () => {
    const settings = read("app/cabinet/settings/settings-client.tsx");
    expect(settings).toContain('<h1 className="soft-h1 mt-2">Аккаунт</h1>');
  });
});

// ── item 6 · settings notifications block no longer overlaps on mobile ────────
describe("R7 item 6 — notifications matrix is responsive at 393px", () => {
  it("toggle columns shrink on mobile and the telegram block stacks", () => {
    const notif = read("components/notifications/notification-settings.tsx");
    // narrow toggle columns on mobile, full width from sm up
    expect(notif).toContain("w-12");
    expect(notif).toContain("sm:w-20");
    // telegram header stacks vertically on mobile
    expect(notif).toContain("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between");
    // reminder chips no longer use off-palette legacy tokens
    expect(notif).not.toContain("bg-primary/20");
    expect(notif).not.toContain("bg-card/40");
  });
});

// ── item 7 · «О себе» is a collapsible hub row; nudge only when unfilled ──────
describe("R7 item 7 — «О себе» is a hub row with a conditional nudge", () => {
  it("«О себе» renders as a SettingsHubRow, not a floating card", () => {
    const settings = read("app/cabinet/settings/settings-client.tsx");
    expect(settings).toContain('id="settings-about"');
    expect(settings).toContain('testId="settings-group-about"');
    expect(settings).toContain("<ExtendedProfileFields onLoaded={setAboutFilled} />");
  });

  it("the apricot nudge only shows while the profile is empty", () => {
    const settings = read("app/cabinet/settings/settings-client.tsx");
    expect(settings).toContain("aboutFilled === false");
    // completeness is reported up from the fields
    expect(settings).toContain("onLoaded?.(filled)");
    // the old always-on toggle state is gone
    expect(settings).not.toContain("const [aboutOpen, setAboutOpen]");
  });
});

// ── audit polish B9 (card-padding rhythm) + B10 (44px tap targets) ────────────
describe("R7 audit polish — B9 padding rhythm + B10 tap targets", () => {
  it("client home primary links carry a 44px (min-h-11) tap target", () => {
    const home = read("app/cabinet/page.tsx");
    // B602: пилюля баланса снята с Главной (владелец), «Все разборы» уехали в
    // «Дневник». Оставшиеся ссылки-действия держат 44 px.
    expect(home).toContain('<section data-testid="client-primary-action">');
    expect(home).toContain("soft-chip min-h-11 w-fit");
    expect(home).toContain("inline-flex min-h-11 w-fit items-center gap-2 rounded-full");
    // B602: кнопку ко дну карточки прижимает ОБЁРТКА, а не марджин на самой
    // кнопке — иначе `pt-4` раздувает пилюлю, а инлайновый marginTop молча
    // перебивает `mt-auto` и оставляет дыру под кнопкой.
    expect(home).toContain('<div className="mt-auto pt-4">');
  });

  it("billing cards use p-5 md:p-6 and «Сравнить тарифы» is 44px", () => {
    const billing = read("components/cabinet/billing-panel.tsx");
    expect(billing).toContain("soft-card p-5 md:p-6");
    expect(billing).not.toContain('className="soft-card p-6"');
    expect(billing).toContain('minHeight: "2.75rem"');
  });
});

// ── audit B7 — notification panel is viewport-bounded on mobile ───────────────
describe("R7 audit B7 — notification popover fits the mobile viewport", () => {
  it("the panel is a bounded flex column with an internally-scrolling list", () => {
    const bell = read("components/notification-bell.tsx");
    // whole panel capped to the viewport, flex column, clips its rounded corners
    expect(bell).toContain("max-h-[min(70vh,34rem)]");
    expect(bell).toContain("flex-col overflow-hidden");
    // the list flexes + scrolls inside instead of a fixed pixel height that
    // pushed the footer + bottom rounded corner off-screen behind the nav bar
    expect(bell).toContain("min-h-0 flex-1 overflow-y-auto");
    expect(bell).not.toContain("maxHeight: 420");
  });
});
