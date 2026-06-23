import fs from "node:fs";
import path from "node:path";
import { buildDeepReportPreview, heuristicDeepReport, DEEP_REPORT_SECTIONS } from "@/lib/deep-report";

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

// B442 (M28): «Подробный разбор» — самодостаточная услуга на методе клинической
// формулировки случая (5P + problem-solving). Контекст собирается ВНУТРИ услуги
// (sourceText), без первичного диалога; результат — документ 6–10 страниц; автосейв.
describe("B442 deep report product (Подробный разбор)", () => {
  const sourceText = "Стоит ли менять работу сейчас? Нет ощущения роста, но страшно потерять стабильность.";

  it("builds a self-contained preview and case-formulation fallback from free-text input", () => {
    const preview = buildDeepReportPreview(sourceText);
    const report = heuristicDeepReport(sourceText);

    expect(preview).toContain("Оглавление подробного разбора");
    expect(preview).toContain("Стоит ли менять работу");
    // все 7 секций формулировки случая
    for (const sectionTitle of DEEP_REPORT_SECTIONS) {
      expect(report).toContain(sectionTitle);
    }
    expect(report).not.toContain("гарантированно");
  });

  it("keeps a durable ProductResult model for paid outputs", () => {
    const schema = source("prisma/schema.prisma");
    expect(schema).toContain("model ProductResult");
    expect(schema).toContain('@@map("product_results")');
  });

  it("route is self-contained (sourceText, no dialogue) with autosave + per-use consume", () => {
    const route = source("src/app/api/products/deep-report/route.ts");
    const itemRoute = source("src/app/api/products/deep-report/[id]/route.ts");
    const exportRoute = source("src/app/api/products/deep-report/[id]/export/route.ts");

    // B444: бесплатного предпросмотра/оглавления больше нет — только generate.
    expect(route).toContain('z.literal("generate")');
    expect(route).not.toContain('z.literal("preview")');
    expect(route).toContain("sourceText");
    expect(route).not.toContain("db.dialogue");
    expect(route).toContain("generateDeepReport");
    expect(route).toContain("consumeProductEntitlementForUse");
    expect(route).toContain('code: "PAYMENT_REQUIRED"');
    expect(route).toContain("savedAt: new Date()");
    expect(itemRoute).toContain('action: z.enum(["save"])');
    expect(exportRoute).toContain("Content-Disposition");
  });

  it("raises the token budget so the document can really be 6–10 pages", () => {
    const lib = source("src/lib/deep-report.ts");
    const policy = source("src/lib/ai-gateway/task-policy.ts");
    expect(lib).toContain("maxTokens: 9000");
    // policy entry for product-deep-report also lifted
    expect(policy).toContain("maxTokens: 9000");
  });

  it("wires a self-contained product surface (no checkin/ProductIntake) into the deep-report flow", () => {
    const detailPage = source("src/app/products/[slug]/page.tsx");
    const actions = source("src/components/products/deep-report-actions.tsx");

    expect(detailPage).toContain("<DeepReportActions");
    expect(actions).toContain('data-testid="deep-report-actions"');
    expect(actions).not.toContain("ProductIntake");
    expect(actions).toContain("/api/products/deep-report");
    expect(actions).toContain("<ProductPurchaseControls");
    expect(actions).toContain('checkoutSource="deep-report-generate"');
    // B443: воронка унифицирована на общий ServiceTriage (как chat-analysis/tarot)
    expect(actions).toContain("<ServiceTriage");
    expect(actions).toContain("recommendSecondaryProducts");
    expect(actions).not.toContain("getNextStepRecommendation");
    expect(actions).not.toContain("next-step-card");
  });
});
