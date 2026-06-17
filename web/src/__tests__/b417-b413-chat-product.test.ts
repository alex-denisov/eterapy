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
    expect(page).toContain('data-testid="product-hero-price"');
    expect(page).toContain("Решить вопрос в чате");
    // SEO + JSON-LD for the new route
    expect(page).toContain('route="/products/chat"');
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
    // paid-only start gate + live countdown timer
    expect(panel).toContain('data-testid="companion-start-gate"');
    expect(panel).toContain('data-testid="companion-timer"');
    // guests routed to the full /login page (B415), not an inline notice
    expect(panel).toContain("loginUrl()");
  });
});

// B413 — «Продолжить разговор в чате» continues in place as a paid session
// (no bounce to /cabinet/chat), with the «Первичный разбор» expanded and the
// recs hidden while the timer runs.
describe("B413 — in-page paid chat continuation", () => {
  it("replaces the /cabinet/chat bounce with an in-page chat panel", () => {
    const page = source("src/app/checkin/page.tsx");
    // the old external link target is gone
    expect(page).not.toContain("/cabinet/chat?dialogueId=");
    // the chat CTA toggles in-page state (or sends guests to /login)
    expect(page).toContain("setShowChat(true)");
    expect(page).toContain("loginUrl()");
    // the panel mounts inline on the same dialogue, with a collapse callback
    expect(page).toContain('data-testid="dialogue-inplace-chat"');
    expect(page).toContain("onSessionEnd={() => setShowChat(false)}");
    expect(page).toContain("inline");
  });

  it("expands «Первичный разбор» and hides the recs while the chat is open", () => {
    const page = source("src/app/checkin/page.tsx");
    // disclosure forced open in chat mode
    expect(page).toContain("showChat ? { open: true }");
    // recs/band wrapped behind !showChat
    expect(page).toContain("{!showChat && (");
  });
});
