import fs from "node:fs";
import path from "node:path";
import { buildReframePreview, heuristicReframe } from "@/lib/reframe";

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

// B441 (M28): «Переосмысление» (reframe) — самодостаточная услуга на методе
// когнитивного рефрейминга (CBT). Контекст собирается ВНУТРИ услуги (sourceText),
// без первичного диалога/checkin; результат — 4 линзы; автосейв в Дневник.
describe("B441 reframe product (Переосмысление)", () => {
  const sourceText = "Руководитель раскритиковал мою работу при всех, и я не могу перестать думать, что меня уволят.";

  it("builds a self-contained preview and CBT-grounded fallback from free-text input", () => {
    const preview = buildReframePreview(sourceText);
    const report = heuristicReframe(sourceText);

    expect(preview).toContain("четыре угла");
    expect(preview).toContain("когнитивного рефрейминга");

    const reportJson = JSON.parse(report.text) as { angles: Array<{ id: string; title: string }> };
    expect(reportJson.angles).toHaveLength(4);
    expect(reportJson.angles.map((a) => a.id)).toEqual(["thoughts", "feelings", "reframe", "step"]);
    expect(reportJson.angles[2].title).toBe("Другой взгляд");
  });

  it("keeps a durable ProductResult model for paid outputs", () => {
    const schema = source("prisma/schema.prisma");
    expect(schema).toContain("model ProductResult");
    expect(schema).toContain('@@map("product_results")');
  });

  it("route is self-contained (sourceText, no dialogue) with autosave + per-use consume", () => {
    const route = source("src/app/api/products/reframe/route.ts");
    const itemRoute = source("src/app/api/products/reframe/[id]/route.ts");
    const exportRoute = source("src/app/api/products/reframe/[id]/export/route.ts");

    expect(route).toContain('PRODUCT_KEY = "reframe"');
    // B444: бесплатного предпросмотра больше нет — единственное действие generate.
    expect(route).toContain('z.literal("generate")');
    expect(route).not.toContain('z.literal("preview")');
    expect(route).toContain("sourceText");
    expect(route).not.toContain("dialogueId");
    expect(route).toContain("generateReframe");
    expect(route).toContain("consumeProductEntitlementForUse");
    expect(route).toContain('code: "PAYMENT_REQUIRED"');
    // автосейв в Дневник на генерации
    expect(route).toContain("savedAt: new Date()");
    expect(itemRoute).toContain('action: z.enum(["save"])');
    expect(itemRoute).toContain('productKey: "reframe"');
    expect(exportRoute).toContain("Content-Disposition");
  });

  it("wires a self-contained product surface (no checkin/ProductIntake) into the reframe flow", () => {
    const detailPage = source("src/app/products/[slug]/page.tsx");
    const actions = source("src/components/products/reframe-actions.tsx");

    expect(detailPage).toContain("<ReframeActions");
    expect(detailPage).toContain('product.slug === "reframe"');
    expect(actions).toContain('data-testid="reframe-actions"');
    expect(actions).not.toContain("ProductIntake");
    expect(actions).toContain('productKey="reframe"');
    expect(actions).toContain("/api/products/reframe");
    // B443: воронка унифицирована на общий ServiceTriage (как chat-analysis/tarot)
    expect(actions).toContain("<ServiceTriage");
    expect(actions).toContain("recommendSecondaryProducts");
    expect(actions).not.toContain("getNextStepRecommendation");
    expect(actions).not.toContain("next-step-card");
    expect(actions).toContain("дневник");
  });
});
