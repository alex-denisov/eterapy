import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("B437 tarot refinements", () => {
  const actions = source("src/components/products/symbolic-product-actions.tsx");
  const visuals = source("src/components/products/esoteric-chart-visuals.tsx");
  const route = source("src/app/api/products/symbolic/route.ts");

  it("renders the real Rider-Waite-Smith card images, not the old SVG glyph", () => {
    expect(visuals).toContain("/tarot/");
    expect(visuals).toContain("tarotCardImageSrc");
    // the old flat-purple SVG fill must be gone
    expect(visuals).not.toContain("#4A3E5E");
    expect(visuals).not.toContain("СТАРШИЙ АРКАН");
  });

  it("#2 uses a compact scrollable spread selector without the helper subtext", () => {
    expect(actions).toContain("<ScrollStrip");
    expect(actions).toContain("tarot-strip-arrow");
    // helper text was moved to a title attribute, not a visible <small>
    expect(actions).not.toContain("<small>{option.helper}</small>");
  });

  it("#4 collapses the controls and reveals cards in-place", () => {
    expect(actions).toContain("tarot-controls-collapsed");
    expect(actions).toContain('data-testid="tarot-reveal"');
  });

  it("#5 replaces the static 'Новый расклад' with a result-aware repeat CTA", () => {
    expect(actions).toContain('tarot-new-reading');
    expect(actions).toContain("function resetReading");
    // CTA text is generated from the reading (theme-aware), with a sensible fallback
    expect(actions).toContain("tarotRecs?.repeatCta");
    expect(actions).toContain("Задать картам новый вопрос");
    // the old static label is gone
    expect(actions).not.toContain("Новый расклад");
  });

  it("#6 auto-saves tarot readings, shows a quiet note, and drops the PDF/diary buttons", () => {
    // B450: автосейв обобщён на набор AUTOSAVE_PRODUCTS (включает tarot).
    expect(route).toContain('AUTOSAVE_PRODUCTS = new Set<SymbolicProductKey>(["tarot", "natal-chart"');
    expect(route).toContain("AUTOSAVE_PRODUCTS.has(productKey) ? { savedAt: new Date() }");
    // the question (userInput) is persisted in metadata
    expect(route).toContain("userInput");
    // the result page shows an auto-saved note instead of a save button or PDF export
    expect(actions).toContain("AutosavedNote");
    expect(actions).toContain('testId="tarot-autosaved"');
    expect(source("src/components/ui/autosaved-note.tsx")).toContain("Сохранено в Дневнике автоматически");
    expect(actions).not.toContain('data-testid="symbolic-pdf-tarot"');
    expect(actions).not.toContain('data-testid="tarot-open-diary"');
  });

  it("#10/#11 scrolls both selectors and separates themes (domains) from spreads (layouts)", () => {
    // both the category (theme) and the card-count (spread) selectors scroll
    expect((actions.match(/<ScrollStrip/g) ?? []).length).toBeGreaterThanOrEqual(2);
    // spreads are named depth layouts — no topic-named spreads that collide with themes
    expect(actions).toContain('key: "one"');
    expect(actions).toContain('key: "celtic"');
    expect(actions).not.toContain('key: "choice"');
    expect(actions).not.toContain('key: "relationship"');
    expect(actions).not.toContain('key: "five"');
    // themes are life domains
    expect(actions).toContain("Любовь и отношения");
    expect(actions).toContain("Деньги и быт");
  });

  it("keeps the pinned product-page testids intact", () => {
    expect(actions).toContain('data-testid="tarot-product-actions"');
    expect(actions).toContain('data-testid="tarot-deck-preview"');
    // B440-followup (Task 1): the separate per-card summary block was removed —
    // its position/short meaning duplicated the cards + the reading. The cards
    // and the reading reveal remain pinned.
    expect(actions).toContain('data-testid="tarot-reveal"');
  });
});
