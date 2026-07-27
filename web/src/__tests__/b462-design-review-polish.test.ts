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
  // B464 round-6 #6 → B602: строки разборов сняты с Главной вместе с блоком
  // «ваши результаты» и живут теперь в «Дневнике». Защита от переполнения на
  // 390 px — там же и в тех же CSS-правилах.
  describe("§3.1 «ваши разборы» mobile overflow (HIGH)", () => {
    const row = source("app/cabinet/diary/page.tsx");
    const css = source("app/v4-soft.css");

    it("lets the text column shrink and wrap instead of clipping", () => {
      expect(row).toContain("soft-result-body");
      expect(css).toMatch(/\.soft-result-body\s*\{[^}]*min-width:\s*0/);
      expect(css).toMatch(/\.soft-result-title\s*\{[^}]*overflow-wrap:\s*anywhere/);
    });

    it("keeps no fixed-width column that would push actions out at 390px", () => {
      expect(row).not.toMatch(/width:\s*110\b/);
      expect(row).not.toContain("w-[110px]");
    });

    it("keeps the action cluster pinned and non-shrinking (flex:none)", () => {
      expect(row).toContain("soft-result-acts");
      expect(css).toMatch(/\.soft-result-act\s*\{[^}]*flex:\s*none/);
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
    const billing = source("components/cabinet/billing-panel.tsx");

    it("does not return null while the next-auth session is loading", () => {
      // Root cause of the blank screenshot: `if (status === "loading") return null;`.
      expect(billing).not.toMatch(/status === "loading"\)\s*return null/);
    });

    it("shows a loading shell instead", () => {
      expect(billing).toContain("billing-loading");
    });
  });

  describe("§4.1 practitioner money history never renders a horizontal-scroll table", () => {
    // B466: «Движение средств» — stacked list-rows на всех вьюпортах (mockup
    // -movements), таблица с горизонтальным скроллом исключена вовсе.
    const movements = source("app/cabinet/practitioner/finance/movements/page.tsx");

    it("renders stacked card rows with no <table> at any width", () => {
      expect(movements).not.toContain("<table");
      expect(movements).toContain("divide-y");
      expect(movements).toContain("Движение средств");
    });
  });

  describe("§4.2 product order-surface keeps neutral chrome on focus", () => {
    const css = source("app/v4-soft.css");

    it("keeps the tarot/natal/HD order surface from looking like a validation error", () => {
      expect(css).toMatch(/\.product-order-surface:focus-within\s*\{/);
      const block = css.slice(css.indexOf(".product-order-surface:focus-within"));
      expect(block.slice(0, 220)).not.toContain("--soft-terracotta");
      expect(block.slice(0, 220)).toContain("--soft-paper-edge");
      expect(block.slice(0, 220)).toContain("--soft-shadow-sm");
    });

    it("keeps the neutral focus handling viewport-unconditional (not behind a min-width media)", () => {
      // Regression guard: the surface's base styles live inside min-width:768 /
      // max-width:760 media blocks. The focus-within override must sit BEFORE
      // the first @media so mobile product forms do not get the old red tint.
      expect(css.indexOf(".product-order-surface:focus-within")).toBeLessThan(css.indexOf("@media"));
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
