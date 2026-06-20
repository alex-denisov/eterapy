import fs from "node:fs";
import path from "node:path";
import { tarotDeckCardByName } from "@/lib/symbolic-products";
import { defaultPromptTextForFeature } from "@/lib/ai-gateway/prompts";
import { clearInputDraft, loadInputDraft, saveInputDraft } from "@/lib/input-draft";

const root = process.cwd();
const source = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("B440 tarot page fixes (#1–#6)", () => {
  const actions = source("src/components/products/symbolic-product-actions.tsx");
  const visuals = source("src/components/products/esoteric-chart-visuals.tsx");
  const css = source("src/app/v4-soft.css");

  describe("#4 crash fix — legacy cards never throw", () => {
    it("tarotCardImageSrc is total and recovers code by name", () => {
      expect(visuals).toContain("function tarotCardImageSrc(card: TarotCard): string | null");
      expect(visuals).toContain("tarotDeckCardByName");
      expect(visuals).toContain("tarot-card-photo-fallback");
    });

    it("ships a branded error boundary for the product route", () => {
      const errorBoundary = source("src/app/products/[slug]/error.tsx");
      expect(errorBoundary).toContain('"use client"');
      expect(errorBoundary).toContain("reset");
    });

    it("resolves a legacy card name (no code) to its real deck code", () => {
      expect(tarotDeckCardByName("Отшельник")?.code).toBe("major-09");
      // trim + case-insensitive
      expect(tarotDeckCardByName("  отшельник  ")?.code).toBe("major-09");
      expect(tarotDeckCardByName("несуществующая карта")).toBeNull();
      expect(tarotDeckCardByName(null)).toBeNull();
    });
  });

  describe("#1 unified card block — stable footprint for any count", () => {
    it("reserves a consistent min-height shared by preview and revealed spread", () => {
      expect(css).toContain("min-height: 13rem");
      expect(css).toMatch(/\.tarot-deck-preview,\s*\n\s*\.tarot-spread/);
    });

    it("the deck preview reports its card count so sizing adapts", () => {
      expect(actions).toContain("data-card-count={Math.min(spread.positions.length, 10)}");
    });
  });

  describe("#5 theme-specific hints requiring name + full DOB", () => {
    it("rotates per-theme placeholders that ask for name and full date of birth", () => {
      expect(actions).toContain("TAROT_EXAMPLES_BY_THEME");
      expect(actions).toContain("tarotExamplesForTheme(tarotTheme)");
      expect(actions).toContain("placeholder={tarotPlaceholder}");
      // examples carry a name + full DD.MM.YYYY date of birth
      expect(actions).toMatch(/\d{2}\.\d{2}\.\d{4}/);
    });
  });

  describe("#6 reading text + recommendations", () => {
    it("the tarot prompt ends on a synthesis, not a templated next step", () => {
      const prompt = defaultPromptTextForFeature("product-tarot");
      expect(prompt).toContain("Общий смысл");
      expect(prompt).toContain("отдельным блоком после расклада");
      // #5: personal-context guidance
      expect(prompt).toContain("на кого делается расклад");
    });

    it("the deterministic fallback reading no longer appends a 'next step'", () => {
      const lib = source("src/lib/symbolic-products.ts");
      expect(lib).not.toContain("## Бережный следующий шаг");
      expect(lib).toContain("## Общий смысл");
    });

    it("raises the tarot token budget for a fuller reading", () => {
      const lib = source("src/lib/symbolic-products.ts");
      expect(lib).toContain('input.productKey === "tarot" ? 2200 : 1400');
    });

    it("the recommendations endpoint returns repeat CTA + other service + esoteric specialist", () => {
      const route = source("src/app/api/products/symbolic/[id]/recommendations/route.ts");
      expect(route).toContain("repeatCta");
      expect(route).toContain("otherProduct");
      expect(route).toContain("specialist");
      expect(route).toContain("TAROT");
      expect(route).toContain("esoteric");
    });
  });

  describe("#3 input survives the login round-trip", () => {
    beforeEach(() => { window.sessionStorage.clear(); });

    it("saves, loads and clears a draft", () => {
      saveInputDraft("symbolic:tarot", { userInput: "про сестру" });
      expect(loadInputDraft<{ userInput: string }>("symbolic:tarot")?.userInput).toBe("про сестру");
      clearInputDraft("symbolic:tarot");
      expect(loadInputDraft("symbolic:tarot")).toBeNull();
    });

    it("treats an all-empty draft as no draft", () => {
      saveInputDraft("symbolic:tarot", { userInput: "   " });
      expect(loadInputDraft("symbolic:tarot")).toBeNull();
    });

    it("is wired into every service that has a text input", () => {
      expect(actions).toContain("useInputDraft");
      expect(source("src/components/products/synastry-actions.tsx")).toContain("useInputDraft");
      expect(source("src/components/products/human-design-actions.tsx")).toContain("useInputDraft");
      expect(source("src/components/products/surname-story-actions.tsx")).toContain("useInputDraft");
      // chat-analysis keeps its own B415 resume-key persistence
      expect(source("src/components/products/chat-analysis-actions.tsx")).toContain("CHAT_ANALYSIS_RESUME_KEY");
    });
  });
});
