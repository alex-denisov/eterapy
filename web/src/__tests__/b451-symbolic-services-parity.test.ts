import fs from "node:fs";
import path from "node:path";
import { computeNumerology } from "@/lib/numerology";
import { defaultPromptTextForFeature } from "@/lib/ai-gateway/prompts";

const root = process.cwd();
const source = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("B451 — numerology/human-design/synastry/surname/family tarot-parity", () => {
  describe("numerology deterministic core numbers", () => {
    it("computes Life Path, Expression and Soul Urge (Pythagorean reduction)", () => {
      const p = computeNumerology("Имя: Анна\nДата рождения: 12.04.1992");
      // 1+2+0+4+1+9+9+2 = 28 → 10 → 1
      expect(p.lifePath).toBe(1);
      // Анна: а1 н6 н6 а1 = 14 → 5
      expect(p.expression).toBe(5);
      // гласные а,а = 2
      expect(p.soulUrge).toBe(2);
      expect(p.name).toBe("Анна");
      expect(p.hasYear).toBe(true);
    });

    it("keeps master numbers and flags a missing year", () => {
      const noYear = computeNumerology("Имя: Лев\nДата рождения: 29.11");
      expect(noYear.hasYear).toBe(false);
      expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 22, 33]).toContain(noYear.lifePath);
    });
  });

  describe("expert prompts with mandatory ## chapters", () => {
    const cases: Array<[string, string[]]> = [
      ["product-numerology", ["опытный нумеролог", "## Число пути", "## Бережные шаги на ближайшее время"]],
      ["product-human-design", ["Human Design", "## Ваш тип", "## Бережные шаги на ближайшее время"]],
      ["product-surname-story", ["ономастик", "## Что говорит форма фамилии", "## Бережные шаги на ближайшее время"]],
      ["product-family-scenarios", ["системной семейной терапии", "## Что вы описали — узор повторов", "## Бережные шаги на ближайшее время"]],
      ["product-synastry", ["астролог по отношениям", "## Общий ритм пары", "## Бережные шаги для пары"]],
    ];
    it.each(cases)("%s is expert-level and structured", (feature, markers) => {
      const prompt = defaultPromptTextForFeature(feature);
      for (const marker of markers) expect(prompt).toContain(marker);
      expect(prompt).not.toContain("Формат: ");
    });

    it("synastry never returns a verdict", () => {
      expect(defaultPromptTextForFeature("product-synastry")).toContain("не выноси приговор");
    });
  });

  describe("symbolic route covers all reworked products", () => {
    const route = source("src/app/api/products/symbolic/route.ts");
    it("includes surname-story in the enum and product keys (fixes latent gap)", () => {
      expect(route).toContain('"surname-story"');
      expect(route).toMatch(/z\.enum\(\[[^\]]*"surname-story"/);
    });
    it("paywall/autosave/mandatory-LLM sets cover all five services", () => {
      for (const key of ["natal-chart", "numerology", "human-design", "surname-story", "family-scenarios"]) {
        expect(route).toContain(`"${key}"`);
      }
    });
  });

  describe("synastry own route brought to parity", () => {
    const route = source("src/app/api/products/synastry/route.ts");
    const idRoute = source("src/app/api/products/synastry/[id]/route.ts");
    it("paywall-402, mandatory-LLM 503, autosave on READY", () => {
      expect(route).toContain("402");
      expect(route).toContain('(generated.metadata as { source?: string }).source !== "ai"');
      expect(route).toContain("503");
      expect(route).toContain("savedAt: new Date()");
    });
    it("exposes a GET on [id] for ?reading= restore", () => {
      expect(idRoute).toContain("export async function GET");
    });
    it("synastry generation uses the editable feature prompt", () => {
      const lib = source("src/lib/synastry.ts");
      expect(lib).toContain('defaultPromptTextForFeature("product-synastry")');
      expect(lib).toContain("maxTokens: 6500");
    });
  });

  describe("token budgets lifted (no system cap)", () => {
    const policy = source("src/lib/ai-gateway/task-policy.ts");
    it.each([
      ["product-numerology", 6000],
      ["product-human-design", 6500],
      ["product-surname-story", 6000],
      ["product-synastry", 6500],
      ["product-family-scenarios", 6500],
    ])("%s maxTokens is %d", (feature, tokens) => {
      const re = new RegExp(`feature: "${feature}"[\\s\\S]{0,500}maxTokens: ${tokens}`);
      expect(policy).toMatch(re);
    });
  });

  describe("each service on shared kit, paid-only, with its visual", () => {
    const cases: Array<[string, string[]]> = [
      ["numerology-actions.tsx", ["useSymbolicService", "SymbolicResultScaffold", "NumerologyChart"]],
      ["human-design-actions.tsx", ["useSymbolicService", "SymbolicResultScaffold", "HumanDesignBodygraph"]],
      ["surname-story-actions.tsx", ["useSymbolicService", "SymbolicResultScaffold", "SurnameLineageVisual"]],
      ["family-scenarios-actions.tsx", ["useSymbolicService", "SymbolicResultScaffold", "FamilyGenogram"]],
      ["synastry-actions.tsx", ["SymbolicResultScaffold", "SynastryWheel", 'searchParams.set("reading"']],
    ];
    it.each(cases)("%s uses kit + visual, no free fragment", (file, markers) => {
      const src = source(`src/components/products/${file}`);
      for (const marker of markers) expect(src).toContain(marker);
      expect(src).toContain("ProductPurchaseControls");
      expect(src).not.toContain("бесплатный фрагмент");
      expect(src).not.toContain("Сначала бесплатный");
      expect(src).not.toContain("soft-badge");
    });
  });

  describe("route wiring + compact hero", () => {
    const page = source("src/app/products/[slug]/page.tsx");
    it("renders the new components for all five services", () => {
      for (const comp of ["NumerologyActions", "HumanDesignActions", "SurnameStoryActions", "FamilyScenariosActions", "SynastryActions"]) {
        expect(page).toContain(comp);
      }
    });
    it("all five are on the compact tool-first hero", () => {
      const compact = page.match(/COMPACT_HERO_SLUGS = new Set<string>\(\[([^\]]*)\]/)?.[1] ?? "";
      for (const slug of ["natal-chart", "numerology", "human-design", "surname-story", "family-scenarios", "synastry"]) {
        expect(compact).toContain(`"${slug}"`);
      }
    });
  });
});
