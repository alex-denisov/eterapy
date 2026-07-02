import fs from "node:fs";
import path from "node:path";

// B462 (M28, walkthrough item 20): deep design-review polish batch, scoped from
// the 159-viewport E2E review (deep_design_review.md §3 bugs + §4 recommendations).
// These are layout/className/CSS fixes on async server components and stylesheets,
// so — following the B461 convention in this same epic — we lock the intent with
// source assertions (jsdom can't compute responsive Tailwind or :focus-within, and
// the cabinet pages are async Prisma server components that don't render in jest).
//
// Fixes covered:
//   1. Cabinet dashboard «недавние разборы» mobile overflow (HIGH)
//   2. Chat-analysis upload affordances grid stacks on mobile (MEDIUM)
//   4. Client billing no longer renders a blank viewport while the session loads
//   5. Practitioner earnings table collapses to cards < 640px (wallet is already a list)
//   6. Product order-surface gets a visible terracotta focus-within ring (a11y + polish)
//   7. Diary + bookings empty states sit on the soft Dialogue-Halo background
//   3. Natal/HD birth inputs are single textareas (resolved by B450) — regression guard

function source(relativePath: string): string {
  const full = path.join(process.cwd(), "src", relativePath);
  return fs.existsSync(full) ? fs.readFileSync(full, "utf8") : "";
}

describe("B462 — deep design-review polish batch", () => {
  describe("§3.1 cabinet dashboard «недавние разборы» mobile overflow (HIGH)", () => {
    const page = source("app/cabinet/page.tsx");

    it("lets the text column shrink and wrap instead of clipping", () => {
      // The recent-dialogue row's text container must allow shrink (min-w-0) so a
      // long title wraps rather than pushing «Открыть» out of the card.
      const row = page.slice(page.indexOf("client-recent-questions"));
      expect(row).toContain("min-w-0");
      expect(row).toContain("break-words");
    });

    it("shrinks the date column on mobile rather than pinning a fixed 110px", () => {
      const row = page.slice(page.indexOf("client-recent-questions"));
      // The old fixed inline width:110 pushed the button out at 390px — replaced by
      // a responsive width that is narrow on mobile and 110px from sm: up.
      expect(row).toContain("sm:w-[110px]");
      expect(row).not.toMatch(/width:\s*110\b/);
    });

    it("keeps «Открыть» inside the card with shrink-0", () => {
      const row = page.slice(page.indexOf("client-recent-questions"));
      expect(row).toContain("Открыть");
      expect(row).toContain("soft-chip shrink-0");
    });
  });

  describe("§3.2 chat-analysis upload affordances stack on mobile (MEDIUM)", () => {
    const actions = source("components/products/chat-analysis-actions.tsx");

    it("stacks the two attach buttons one-per-row below sm:", () => {
      expect(actions).toContain("grid-cols-1 sm:grid-cols-2");
      // The bare 2-column grid (which caused the cramped wrapping) is gone.
      expect(actions).not.toContain('"grid grid-cols-2 gap-2.5 p-3"');
    });
  });

  describe("§3.4 client billing renders a shell, never a blank viewport (HIGH)", () => {
    const billing = source("app/cabinet/billing/page.tsx");

    it("does not return null while the next-auth session is loading", () => {
      // Root cause of the blank screenshot: `if (status === "loading") return null;`.
      expect(billing).not.toMatch(/status === "loading"\)\s*return null/);
    });

    it("shows a loading shell instead", () => {
      expect(billing).toContain("billing-loading");
    });
  });

  describe("§4.1 practitioner earnings table collapses to cards < 640px", () => {
    const table = source("app/cabinet/practitioner/earnings/earnings-movements-table.tsx");

    it("hides the real <table> below sm and shows a stacked card list instead", () => {
      // Desktop keeps the table; mobile gets vertical list-cards (no horizontal scroll).
      expect(table).toContain("hidden sm:block");
      expect(table).toContain("sm:hidden");
      expect(table).toContain("practitioner-earnings-card");
    });
  });

  describe("§4.2 product order-surface has a visible terracotta focus ring", () => {
    const css = source("app/v4-soft.css");

    it("adds a focus-within ring to the tarot/natal/HD order surface", () => {
      // The big editorial .soft-question-input strips its own outline, so the
      // visible focus indicator lives on the card (mirrors landing-question-surface).
      expect(css).toMatch(/\.tarot-order-surface:focus-within\s*\{/);
      // The ring uses the Soft-Clarity terracotta, not the default browser outline.
      const block = css.slice(css.indexOf(".tarot-order-surface:focus-within"));
      expect(block.slice(0, 220)).toContain("--soft-terracotta");
    });

    it("keeps the focus ring viewport-unconditional (not behind a min-width media)", () => {
      // Regression guard: the surface's base styles live inside min-width:768 /
      // max-width:760 media blocks. The focus ring must sit BEFORE the first
      // @media so it shows at every viewport — mobile users tab into the field
      // too, and the review was mobile-centric. (Caught live: a desktop-gated
      // version left 390px with no ring.)
      expect(css.indexOf(".tarot-order-surface:focus-within")).toBeLessThan(css.indexOf("@media"));
    });
  });

  describe("§4.3 empty states sit on the soft Dialogue-Halo background", () => {
    const diary = source("app/cabinet/diary/page.tsx");
    const bookings = source("app/cabinet/bookings/page.tsx");
    const css = source("app/v4-soft.css");

    it("defines a reusable soft-empty-stage halo utility", () => {
      expect(css).toMatch(/\.soft-empty-stage\s*\{/);
      expect(css).toContain(".soft-empty-stage::before");
    });

    it("applies the halo to the diary «Здесь пока пусто» empty state", () => {
      const block = diary.slice(diary.indexOf("Здесь пока пусто") - 200, diary.indexOf("Здесь пока пусто"));
      expect(block).toContain("soft-empty-stage");
    });

    it("applies the halo to the bookings «Пока нет записей» empty state", () => {
      const block = bookings.slice(bookings.indexOf("Пока нет записей") - 200, bookings.indexOf("Пока нет записей"));
      expect(block).toContain("soft-empty-stage");
    });
  });

  describe("§3.3 natal/HD birth inputs are single textareas (resolved by B450)", () => {
    const natal = source("components/products/natal-chart-actions.tsx");
    const hd = source("components/products/human-design-actions.tsx");

    it("uses one birth textarea, not a cramped grid-cols-2 of date/time/location", () => {
      expect(natal).toContain('data-testid="natal-birth-input"');
      expect(hd).toContain('data-testid="hd-birth-input"');
      // The stale «Время рождения (если известно)» two-column input layout is gone.
      expect(natal).not.toContain("Время рождения (если известно)");
      expect(hd).not.toContain("Время рождения (если известно)");
    });
  });
});
