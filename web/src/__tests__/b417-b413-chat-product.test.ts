import fs from "node:fs";
import path from "node:path";

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

// B417 — companion chat relocated from the cabinet to a catalog product at
// /products/chat, listed as a paid service, debiting баллы on access.
describe("B417 — chat as a catalog service (/products/chat)", () => {
  it("serves the chat at /products/chat with the product-page design language", () => {
    const page = source("src/app/products/chat/page.tsx");
    // dynamic (auth-aware) page hosting the companion panel
    expect(page).toContain('export const dynamic = "force-dynamic"');
    expect(page).toContain("CompanionChatPanel");
    expect(page).toContain('data-testid="product-page-chat"');
    // product-hero parity: round back arrow + price pill + title
    expect(page).toContain('data-testid="product-hero-back"');
    expect(page).toContain("ChatHeroPrice");
    expect(page).toContain("Решить вопрос в чате");
    // SEO + JSON-LD for the new route
    expect(page).toContain('route="/products/chat"');
    // Issue #5: the price pill itself lives in the live hero component, which
    // swaps it for the running session timer once оказание услуги starts.
    const heroPrice = source("src/components/companion/chat-hero-price.tsx");
    expect(heroPrice).toContain('data-testid="product-hero-price"');
    expect(heroPrice).toContain('data-testid="companion-timer"');
  });

  it("redirects the old /cabinet/chat to /products/chat (preserving dialogueId)", () => {
    const page = source("src/app/cabinet/chat/page.tsx");
    expect(page).toContain("redirect(");
    expect(page).toContain("/products/chat");
    expect(page).toContain("dialogueId");
    // no longer renders the panel in the cabinet
    expect(page).not.toContain("CompanionChatPanel");
  });

  it("lists the chat as a paid service in the catalog with a visible price", () => {
    const catalog = source("src/components/products/service-catalog.tsx");
    expect(catalog).toContain('href: "/products/chat"');
    expect(catalog).toContain("Решить вопрос в чате");
    expect(catalog).toContain('price("chat-session")');
  });

  it("registers /products/chat in the SEO route table", () => {
    const seo = source("src/lib/seo.ts");
    const pageSeo = source("src/lib/public-page-seo.ts");
    expect(seo).toContain('"/products/chat"');
    expect(pageSeo).toContain('"/products/chat"');
  });

  it("exposes a precise expiry timestamp for the live session timer", () => {
    const server = source("src/lib/companion-chat-server.ts");
    expect(server).toContain("expiresAt:");
    expect(server).toContain("toISOString()");
  });
});

// The chat is paid-only on every surface — the free tier on the platform is the
// первичный разбор, not a free companion mini-chat (owner decision 2026-06-17).
describe("paid-only companion panel", () => {
  it("drops the surfaced free allowance badge and gates on a paid session", () => {
    const panel = source("src/components/companion/companion-chat-panel.tsx");
    // no «бесплатно · осталось N» plate carried over from the free companion chat
    expect(panel).not.toContain("осталось ");
    // paid-only start gate; the live countdown timer now lives in the hero pill
    expect(panel).toContain('data-testid="companion-start-gate"');
    expect(panel).toContain("dispatchCompanionSession");
    // guests routed to the full /login page (B415), not an inline notice
    expect(panel).toContain("loginUrl()");
  });

  // Issues #4/#8 — one human chat: no «живой диалог» eyebrow and no companion-mode
  // chips (the platform reads the mood itself, it is not chosen with buttons).
  it("drops the live-dialogue eyebrow and the companion-mode chips", () => {
    const panel = source("src/components/companion/companion-chat-panel.tsx");
    expect(panel).not.toContain("живой диалог");
    expect(panel).not.toContain('data-testid="companion-modes"');
    expect(panel).not.toContain("COMPANION_MODES");
  });

  // Issue #6 — «Продлить» replaces «Отправить» only once the timer hits 00:00.
  it("swaps Отправить for Продлить only when the session window has lapsed", () => {
    const panel = source("src/components/companion/companion-chat-panel.tsx");
    expect(panel).toContain("expired ? (");
    expect(panel).toContain('data-testid="companion-extend"');
    expect(panel).toContain('data-testid="companion-char-counter"');
  });

  // Issue #1 — a standalone chat start also carries a session id in the URL so a
  // refresh restores it (parity with the checkin ?dialogueId= restore).
  it("pins the session id into the URL for refresh restore", () => {
    const panel = source("src/components/companion/companion-chat-panel.tsx");
    expect(panel).toContain('url.searchParams.set("sessionId"');
  });
});

// Issue #5 — «Продолжить разговор в чате» now opens the /chat SERVICE keyed to
// the dialogue (URL changes → refresh restores the chat), replacing the earlier
// in-place (B413) continuation that never changed the address bar.
describe("issue #5 — checkin continues into the /chat service", () => {
  it("routes the chat CTA to /products/chat keyed to the dialogue (not an in-place toggle)", () => {
    const page = source("src/components/dialogue/checkin-experience.tsx");
    // the old external cabinet link is gone
    expect(page).not.toContain("/cabinet/chat?dialogueId=");
    // the CTA routes to the /chat service with the dialogue as the session key
    // and a one-click paid start (?start=1)
    expect(page).toContain("/products/chat?dialogueId=${dialogue.id}&start=1");
    // guests pass through /login first
    expect(page).toContain("loginUrl()");
    // no more in-place toggle / inline panel hiding the разбор
    expect(page).not.toContain("setShowChat");
    expect(page).not.toContain("showChat");
    expect(page).not.toContain('data-testid="dialogue-inplace-chat"');
    // the back arrow simply starts a new разбор now
    expect(page).toContain('aria-label="Новый разбор"');
  });

  it("opens the paid session in one click on the /chat page and accepts an analysis key", () => {
    const chatPage = source("src/app/products/chat/page.tsx");
    // ?start=1 → autoStart the paid session; ?analysisId=… seeds from a разбор
    expect(chatPage).toContain("autoStart");
    expect(chatPage).toContain("analysisId");
    const panel = source("src/components/companion/companion-chat-panel.tsx");
    // the panel charges → header balance refreshes live (no reload needed)
    expect(panel).toContain("dispatchBalanceChanged");
    // and scrolls WITHIN the list container (not the page) so the frame stays put
    expect(panel).toContain("el.scrollTop = el.scrollHeight");
    expect(panel).not.toMatch(/\.scrollIntoView\(/);
  });
});
