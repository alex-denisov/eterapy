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

    it("keeps the standard digit-sum life path for 03.03.1988", () => {
      // 0+3+0+3+1+9+8+8 = 32 → 5. Expression/soul depend on the supplied name.
      expect(computeNumerology("Имя: Анна\nДата рождения: 03.03.1988").lifePath).toBe(5);
    });
  });

  describe("expert prompts with mandatory ## chapters", () => {
    const cases: Array<[string, string[]]> = [
      ["product-numerology", ["Матрицы судьбы", "Личность, Талант, Социум, Задача, Центр, Внутренний центр", "### В плюсе", "### В минусе", "### Практики"]],
      ["product-human-design", ["Дизайна человека", "Тип, стратегия, авторитет, профиль и определение всегда идут пятью отдельными разделами", "Каждый заголовок начинай с `##`"]],
      ["product-surname-origin", ["нумеролог буквенного кода", "## Формула фамилии", "### Как проверить у себя", "без автоматического утешения"]],
      // B512 R1-11: экспертный апгрейд «Семейных вопросов» — полная карта
      // рода с обязательными слоями и практиками прерывания.
      ["product-family-questions", ["системный семейный консультант", "## Что вы описали — узор повторов", "## Практики прерывания на 14 дней", "### Как проверить у себя"]],
      ["product-compatibility-by-date", ["астролог по синастрии", "## Главная ось связи", "## Итог в выбранном слое отношений"]],
    ];
    it.each(cases)("%s is expert-level and structured", (feature, markers) => {
      const prompt = defaultPromptTextForFeature(feature);
      for (const marker of markers) expect(prompt).toContain(marker);
      expect(prompt).not.toContain("Формат: ");
    });

    it("synastry gives a direct layer-specific answer without judging people globally", () => {
      const prompt = defaultPromptTextForFeature("product-compatibility-by-date");
      expect(prompt).toContain("## Прямой ответ");
      expect(prompt).toMatch(/вердикт относится только к выбранному слою/i);
    });
  });

  describe("symbolic route covers all reworked products", () => {
    const route = source("src/app/api/products/symbolic/route.ts");
    const idRoute = source("src/app/api/products/symbolic/[id]/route.ts");
    it("includes surname-story in the enum and product keys (fixes latent gap)", () => {
      expect(route).toContain('"surname-origin"');
      expect(route).toMatch(/z\.enum\(\[[^\]]*"surname-origin"/);
    });
    it("paywall/autosave/mandatory-LLM sets cover all five services", () => {
      for (const key of ["natal-chart", "numerology", "human-design", "surname-origin", "family-questions"]) {
        expect(route).toContain(`"${key}"`);
      }
    });
    it("restores human-design and surname-story saved readings by ?reading=", () => {
      for (const key of ["human-design", "surname-origin"]) {
        expect(idRoute).toContain(`"${key}"`);
      }
    });
  });

  describe("synastry own route brought to parity", () => {
    const route = source("src/app/api/products/compatibility-by-date/route.ts");
    const idRoute = source("src/app/api/products/compatibility-by-date/[id]/route.ts");
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
      expect(lib).toContain('defaultPromptTextForFeature("product-compatibility-by-date")');
      expect(lib).toContain("maxTokens: 6500");
    });
  });

  describe("token budgets lifted (no system cap)", () => {
    const policy = source("src/lib/ai-gateway/task-policy.ts");
    it.each([
      ["product-numerology", 6000],
      ["product-human-design", 6500],
      ["product-surname-origin", 6000],
      ["product-compatibility-by-date", 6500],
      ["product-family-questions", 6500],
    ])("%s maxTokens is %d", (feature, tokens) => {
      const re = new RegExp(`feature: "${feature}"[\\s\\S]{0,500}maxTokens: ${tokens}`);
      expect(policy).toMatch(re);
    });
  });

  describe("each service on shared kit, paid-only, with its visual", () => {
    const cases: Array<[string, string[]]> = [
      ["numerology-actions.tsx", ["useSymbolicService", "SymbolicResultScaffold", "NumerologyChart"]],
      ["human-design-actions.tsx", ["useSymbolicService", "SymbolicResultScaffold", "HumanDesignBodygraph"]],
      ["surname-origin-actions.tsx", ["useSymbolicService", "SymbolicResultScaffold", "SurnameLineageVisual"]],
      ["family-questions-actions.tsx", ["useSymbolicService", "SymbolicResultScaffold", "FamilyGenogram"]],
      ["compatibility-by-date-actions.tsx", ["SymbolicResultScaffold", "SynastryWheel", 'searchParams.set("reading"']],
    ];
    it.each(cases)("%s uses kit + visual, no free fragment", (file, markers) => {
      const src = source(`src/components/products/${file}`);
      for (const marker of markers) expect(src).toContain(marker);
      expect(src).toContain("ProductPurchaseControls");
      expect(src).not.toContain("бесплатный фрагмент");
      expect(src).not.toContain("Сначала бесплатный");
      expect(src).not.toContain("soft-badge");
    });

    it("removes generic topic chips from human-design and uses scenario-specific chips for surname audit", () => {
      expect(source("src/components/products/human-design-actions.tsx")).not.toContain("OptionScrollStrip");
      expect(source("src/components/products/surname-origin-actions.tsx")).toContain("OptionScrollStrip");
      expect(source("src/components/products/surname-origin-actions.tsx")).toContain("Смена фамилии");
      expect(source("src/components/products/surname-origin-actions.tsx")).toContain("Псевдоним / бренд");
    });

    it("uses compact one-line inputs for numerology and surname fields", () => {
      expect(source("src/components/products/numerology-actions.tsx")).toContain("product-line-input");
      expect(source("src/components/products/surname-origin-actions.tsx")).toContain("product-line-input");
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
      for (const slug of ["natal-chart", "numerology", "human-design", "surname-origin", "family-questions", "compatibility-by-date"]) {
        expect(compact).toContain(`"${slug}"`);
      }
    });
  });
});
