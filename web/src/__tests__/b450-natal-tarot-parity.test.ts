import fs from "node:fs";
import path from "node:path";
import { splitSections } from "@/lib/report-sections";
import { defaultPromptTextForFeature } from "@/lib/ai-gateway/prompts";

const root = process.cwd();
const source = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("B450 — natal-chart tarot-parity rework", () => {
  describe("universal kit: shared report-sections + section-accordion", () => {
    it("splitSections splits markdown by ## headings and folds the preamble into the first chapter", () => {
      const md = "вводный абзац\n\n## Первая глава\nтекст один\n\n## Вторая глава\nтекст два";
      const sections = splitSections(md);
      expect(sections).toHaveLength(2);
      expect(sections[0].title).toBe("Первая глава");
      expect(sections[0].body).toContain("вводный абзац");
      expect(sections[0].body).toContain("текст один");
      expect(sections[1].title).toBe("Вторая глава");
    });

    it("returns no sections when there are no ## headings (caller renders fallback)", () => {
      expect(splitSections("просто текст без заголовков")).toHaveLength(0);
    });

    it("ships a reusable SectionAccordion that forwards a testId", () => {
      const acc = source("src/components/products/section-accordion.tsx");
      expect(acc).toContain("export function SectionAccordion");
      expect(acc).toContain("testId");
      expect(acc).toContain("data-testid={testId}");
    });

    it("deep-report now consumes the shared kit (no local copies)", () => {
      const deep = source("src/components/products/deep-report-actions.tsx");
      expect(deep).toContain('from "@/components/products/section-accordion"');
      expect(deep).toContain('from "@/lib/report-sections"');
      expect(deep).not.toContain("function splitSections");
      expect(deep).not.toContain("function ReportAccordion");
    });
  });

  describe("expert astrologer prompt", () => {
    const natal = defaultPromptTextForFeature("product-natal-chart");

    it("speaks as a practicing humanistic astrologer, language-of-themes not fate", () => {
      expect(natal).toContain("практикующий астролог");
      expect(natal).toContain("ЯЗЫК ТЕМ");
      expect(natal).toContain("Без фатализма");
    });

    it("anchors strictly on the real Sun sign and forbids inventing Moon/Ascendant signs", () => {
      expect(natal).toContain("знак Солнца");
      expect(natal).toContain("НЕ выдумывай конкретные знаки Луны");
    });

    it("mandates the exact six ## chapters the accordion renders", () => {
      expect(natal).toContain("## Солнце в <знак> — ядро личности");
      expect(natal).toContain("## Луна — чувства и внутренняя опора");
      expect(natal).toContain("## Восходящий знак — как вас видят");
      expect(natal).toContain("## Стихия и ритм характера");
      expect(natal).toContain("## Зоны роста и напряжения");
      expect(natal).toContain("## Бережные шаги на ближайшее время");
    });

    it("forbids code fences / echoing instructions (fence-tolerant downstream parse)", () => {
      expect(natal).toContain("не оборачивай ответ в тройные кавычки");
    });
  });

  describe("no system token cap — full multi-chapter result", () => {
    it("task-policy raises product-natal-chart to 7000 tokens", () => {
      const policy = source("src/lib/ai-gateway/task-policy.ts");
      expect(policy).toMatch(/feature: "product-natal-chart"[\s\S]{0,400}maxTokens: 7000/);
    });

    it("the lib request also asks for the larger natal budget", () => {
      const lib = source("src/lib/symbolic-products.ts");
      expect(lib).toContain('"natal-chart": 7000');
    });

    it("natal facts (real Sun + element + modality) are fed to the model", () => {
      const lib = source("src/lib/symbolic-products.ts");
      expect(lib).toContain("function natalFactsForAI");
      expect(lib).toContain("+ natalNote");
      expect(lib).toContain("Модальность");
    });
  });

  describe("paywall-only / autosave / mandatory-LLM (guaranteed billing for a real result)", () => {
    const route = source("src/app/api/products/symbolic/route.ts");

    it("natal-chart is paywall-only — no free fragment, 402 without entitlement", () => {
      expect(route).toContain('PAYWALL_ONLY_PRODUCTS = new Set<SymbolicProductKey>(["natal-chart"');
      expect(route).toContain("PAYWALL_ONLY_PRODUCTS.has(productKey) && !hasEntitlement");
      expect(route).toContain("402");
    });

    it("autosaves natal results to the diary on READY", () => {
      expect(route).toContain('AUTOSAVE_PRODUCTS = new Set<SymbolicProductKey>(["tarot", "natal-chart"');
      expect(route).toContain("AUTOSAVE_PRODUCTS.has(productKey) ? { savedAt: new Date() }");
    });

    it("never saves or charges a heuristic for mandatory-LLM products (503, no charge)", () => {
      expect(route).toContain('MANDATORY_LLM_PRODUCTS = new Set<SymbolicProductKey>(["natal-chart"');
      expect(route).toContain('(generated.metadata as { source?: string }).source !== "ai"');
      expect(route).toContain("503");
    });
  });

  describe("NatalChartActions — tarot/reframe parity, no free fragment", () => {
    const natal = source("src/components/products/natal-chart-actions.tsx");

    it("intake is tool-first with paid controls and no free-fragment / badges / inline PDF", () => {
      expect(natal).toContain("tarot-order-surface");
      expect(natal).toContain("ProductPurchaseControls");
      expect(natal).not.toContain("бесплатный фрагмент");
      expect(natal).not.toContain("Сначала бесплатный");
      expect(natal).not.toContain("soft-badge");
      expect(natal).not.toContain("Скачать PDF");
    });

    it("result shows the wheel and delegates result chrome to the shared scaffold", () => {
      expect(natal).toContain("<ZodiacWheel");
      expect(natal).toContain("SymbolicResultScaffold");
      const scaffold = source("src/components/products/symbolic-result-scaffold.tsx");
      expect(scaffold).toContain("SectionAccordion");
      expect(scaffold).toContain("ServiceTriage");
      expect(scaffold).toContain("-recap");
      expect(scaffold).toContain("дневник");
    });

    it("is session-scoped via ?reading= and handles 402/503 in the shared hook", () => {
      expect(natal).toContain("useSymbolicService");
      const hook = source("src/components/products/use-symbolic-service.ts");
      expect(hook).toContain('searchParams.set("reading"');
      expect(hook).toContain("typed.status === 402");
      expect(hook).toContain("typed.status === 503");
    });
  });

  describe("route wiring", () => {
    const page = source("src/app/products/[slug]/page.tsx");

    it("renders NatalChartActions for the natal-chart slug", () => {
      expect(page).toContain("NatalChartActions");
      expect(page).toContain('product.slug === "natal-chart"');
    });

    it("moves natal-chart to the compact tool-first hero (no big product hero)", () => {
      expect(page).toMatch(/COMPACT_HERO_SLUGS = new Set<string>\(\[[^\]]*"natal-chart"/);
    });
  });
});
