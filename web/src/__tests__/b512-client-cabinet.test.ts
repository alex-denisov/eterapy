import fs from "node:fs";
import path from "node:path";

// B512 — клиентский кабинет: converged soft-clarity visual + owner-approved
// mechanics (handoff: docs/v5-release/tasks/B512-build-handoff.md).

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("B512 §3.1 — global CTA → bordeaux", () => {
  const css = source("src/app/v4-soft.css");

  it("paints .soft-button-primary bordeaux (landing + cabinet + cockpit unify)", () => {
    const block = css.slice(css.indexOf(".soft-button-primary {"), css.indexOf(".soft-button-ghost {"));
    expect(block).toContain("var(--soft-bordeaux)");
    expect(block).not.toContain("background: var(--soft-terracotta)");
  });

  it("paints the header CTA bordeaux too", () => {
    const block = css.slice(css.indexOf(".soft-header-cta-primary {"), css.indexOf(".soft-header-cta-ghost {"));
    expect(block).toContain("var(--soft-bordeaux)");
    expect(block).not.toContain("background: var(--soft-terracotta)");
  });
});

describe("B512 §3.2 / R1-2 — desktop chrome", () => {
  const header = source("src/components/header.tsx");

  it("R1-2: landing shows ONE split pill (main → cabinet, chevron → user menu)", () => {
    expect(header).toContain("soft-user-pill-split");
    expect(header).toContain("soft-user-pill-main");
    expect(header).toContain("soft-user-pill-chevron");
    expect(header).toContain('data-testid="header-cabinet-door"');
    // Внутри кабинета дропдаун — разделы ЛК (slim-вариант отменён owner'ом).
    expect(header).not.toContain("slim ? []");
    expect(header).toContain('label: "Кошелёк"');
  });

  it("«Ещё» on the landing bar navigates for clients (href) and keeps the guest sheet", () => {
    expect(header).toContain("item.label === MORE_LABEL && !item.href");
  });
});

describe("B512 §3.3 — mobile top bar + services icon + «Ещё» hub", () => {
  it("maps NAV_ICONS.services to Compass (✦ collision with the balance chip)", () => {
    const icons = source("src/components/nav/nav-icons.ts");
    expect(icons).toContain("services: Compass");
    expect(icons).not.toContain("services: Sparkles");
  });

  it("renders the client mobile appbar as brand + balance chip + bell", () => {
    const shell = source("src/components/cabinet/cabinet-shell.tsx");
    expect(shell).toContain('data-testid="client-mobile-appbar"');
    expect(shell).toContain("ClientBalanceChip");
    expect(shell).toContain("VectorBrandLogo");
    expect(shell).toContain("client-mobile-appbar");
  });

  it("makes the bell a rounded square (r12) only inside the client appbar", () => {
    const css = source("src/app/v4-soft.css");
    expect(css).toContain(".client-mobile-appbar .soft-notification-trigger");
    const block = css.slice(css.indexOf(".client-mobile-appbar .soft-notification-trigger"));
    expect(block.slice(0, 300)).toContain("border-radius: 12px");
  });

  it("balance chip reads confirmed credits and links to /wallet", () => {
    const chip = source("src/components/cabinet/client-balance-chip.tsx");
    expect(chip).toContain("useClarityCreditBalance");
    expect(chip).toContain('appUrl("/wallet")');
    expect(chip).toContain('data-testid="client-mobile-balance-chip"');
    const hook = source("src/components/use-clarity-credit-balance.ts");
    expect(hook).toContain("/api/billing/transactions");
    expect(hook).toContain("BALANCE_CHANGED_EVENT");
  });

  it("builds /cabinet/more as a real hub page mirroring the practitioner hub", () => {
    const page = source("src/app/cabinet/more/page.tsx");
    expect(page).toContain("guardClientCabinet");
    expect(page).toContain("CLIENT_MORE_SECTIONS");
    expect(page).toContain('data-testid="client-more-profile-card"');
    expect(page).toContain('data-testid="client-more-logout"');
    // Кошелёк row carries the balance meta; Записи/Сообщения carry counters.
    expect(page).toContain("getClarityCreditBalance");
    expect(page).toContain("practitionerClientMessage.count");
  });
});

describe("B512 — Главная (client-desktop-home-v2 / client-mobile-home-v2)", () => {
  const home = source("src/app/cabinet/page.tsx");

  it("flattens the greeting (no wrapper card) and desktop-only balance pill", () => {
    expect(home).toContain('<section data-testid="client-primary-action">');
    expect(home).toContain('className="mt-4 hidden md:block" data-testid="client-dashboard-balance"');
  });

  it("lays the dash out as two desktop columns", () => {
    expect(home).toContain("md:grid-cols-[1.55fr_1fr]");
  });

  it("adds the rail Кошелёк card with the warm expiry line (P6, no countdown)", () => {
    expect(home).toContain('data-testid="client-home-wallet-card"');
    expect(home).toContain('data-testid="client-credit-expiry"');
    expect(home).toContain("Баллы действуют до");
    expect(home).toContain('type: "grant", expiresAt: { gt: new Date() }');
    // Ethical guardrail: a warm line, not a countdown timer.
    expect(home).not.toContain("осталось дней");
  });

  it("renders the privacy trust strip (R1-6: clickable PIN control)", () => {
    expect(home).toContain("HomePinStrip");
    const strip = source("src/components/cabinet/home-pin-strip.tsx");
    expect(strip).toContain('data-testid="client-trust-strip"');
    expect(strip).toContain("152-ФЗ");
  });

  it("keeps crisis-guard and the B464 mechanics intact", () => {
    expect(home).toContain("client-crisis-continuity");
    expect(home).toContain("client-referral-card");
    expect(home).toContain("client-daily-card");
    expect(home).toContain("client-first-steps");
    expect(home).toContain("crisisGuard");
  });

  it("passes shareTopic to the result rows (result-moment share, M4)", () => {
    expect(home).toContain("shareTopic: item.shareTopic");
    expect(home).toContain('shareTopic: d.topic ?? "dialogue"');
    expect(home).toContain("shareTopic: r.productKey");
  });
});

describe("B512 §3.5 — result-moment share/gift (M4, ethical)", () => {
  it("offers BOTH honest actions: anonymized insight + gift-a-разбор", () => {
    const action = source("src/components/cabinet/result-share-action.tsx");
    expect(action).toContain("/share?from=");
    expect(action).toContain('appUrl("/invite")');
    expect(action).toContain("result_share_clicked");
    expect(action).toContain("result_gift_clicked");
    expect(action).toContain("soft-result-act-share");
  });

  it("mounts the share action on every Главная result row", () => {
    const row = source("src/components/cabinet/cabinet-result-row.tsx");
    expect(row).toContain("ResultShareAction");
    expect(row).toContain('surface="cabinet_home"');
  });

  it("styles the share action lilac (services bridge colour)", () => {
    const css = source("src/app/v4-soft.css");
    expect(css).toContain(".soft-result-act-share");
  });
});

describe("B512 §3.4 — settings rework", () => {
  const settings = source("src/app/cabinet/settings/settings-client.tsx");

  it("narrows «Способы входа» to VK and hides the block for email+password accounts", () => {
    expect(settings).toContain('vk: "ВКонтакте"');
    expect(settings).not.toContain('google: "Google"');
    expect(settings).not.toContain('telegram: "Telegram"');
    expect(settings).not.toContain('apple: "Apple"');
    expect(settings).toContain('provider === "vk"');
    expect(settings).toContain("connectedProviders.length > 0 && (");
  });

  it("shows email as a disabled field (support-only change)", () => {
    expect(settings).toContain('data-testid="settings-email-disabled"');
    expect(settings).toContain("disabled readOnly");
  });

  it("supports removing the profile photo", () => {
    expect(settings).toContain("handleRemoveAvatar");
    expect(settings).toContain('data-testid="settings-avatar-remove"');
    const route = source("src/app/api/auth/update-profile/route.ts");
    expect(route).toContain("removeAvatar");
    expect(route).toContain("data.avatarUrl = null");
  });

  it("keeps «О себе» expandable with no phantom «учитывать данные» toggle", () => {
    expect(settings).toContain('id="settings-about"');
    expect(settings).not.toContain("Учитывать эти данные");
  });
});

describe("B512 §3.6 — backend with the rollout", () => {
  it("wallet copy is honest about формат-dependent cost", () => {
    const wallet = source("src/app/cabinet/wallet/page.tsx");
    expect(wallet).toContain("Баллами открываются цифровые разборы · стоимость зависит от формата");
    expect(wallet).not.toContain("1 балл ≈ один разбор");
  });

  it("bounds the reschedule cycle: one proposal per side, no counter-proposals", () => {
    const route = source("src/app/api/bookings/[id]/change-requests/route.ts");
    // One OPEN request per booking (either side) …
    expect(route).toContain('status: "PENDING"');
    // … and after YOUR reschedule proposal is declined you cannot re-propose
    // in the same cycle (an approved reschedule starts a fresh cycle).
    expect(route).toContain("declinedThisCycle");
    expect(route).toContain('status: "DECLINED"');
    expect(route).toContain("Ваше предложение переноса уже отклонили");
    // The recipient still only approves/declines (resolverFor in PATCH).
    const patchRoute = source("src/app/api/bookings/[id]/change-requests/[requestId]/route.ts");
    expect(patchRoute).toContain("resolverFor");
  });
});
