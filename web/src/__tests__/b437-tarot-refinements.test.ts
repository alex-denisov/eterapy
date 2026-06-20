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

  it("#5 offers a 'Новый расклад' reset action", () => {
    expect(actions).toContain('data-testid="tarot-new-reading"');
    expect(actions).toContain("Новый расклад");
    expect(actions).toContain("function resetReading");
  });

  it("#6 auto-saves tarot readings (with the question) to the Дневник", () => {
    expect(route).toContain('productKey === "tarot" ? { savedAt: new Date() }');
    // the question (userInput) is persisted in metadata
    expect(route).toContain("userInput");
    expect(actions).toContain('appUrl("/cabinet/diary")');
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
    expect(actions).toContain('data-testid="tarot-result-summary"');
  });
});
