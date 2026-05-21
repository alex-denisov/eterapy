import fs from "node:fs";
import path from "node:path";
import { buildDeepReportPreview, heuristicDeepReport } from "@/lib/deep-report";

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("B085 deep report product", () => {
  const dialogue = {
    id: "dlg-1",
    title: "Стоит ли менять работу",
    topic: "career",
    difficulty: "medium",
    safetyLevel: "normal",
    messages: [
      { role: "USER", content: "Стоит ли менять работу сейчас?" },
      { role: "ASSISTANT", content: "Что в текущей работе сильнее всего истощает?" },
      { role: "USER", content: "Нет ощущения роста, но страшно потерять стабильность." },
    ],
  };

  it("creates a meaningful preview and safe fallback report from dialogue context", () => {
    const preview = buildDeepReportPreview(dialogue);
    const report = heuristicDeepReport(dialogue);

    expect(preview).toContain("Предпросмотр глубокого отчета");
    expect(preview).toContain("Стоит ли менять работу");
    expect(report).toContain("Глубокий отчет");
    expect(report).toContain("План на 24-72 часа");
    expect(report).not.toContain("гарантированно");
  });

  it("adds a durable ProductResult model for paid outputs", () => {
    const schema = source("prisma/schema.prisma");
    const migration = source("prisma/migrations/20260506042000_add_product_results/migration.sql");

    expect(schema).toContain("model ProductResult");
    expect(schema).toContain('@@map("product_results")');
    expect(migration).toContain('CREATE TABLE "product_results"');
    expect(migration).toContain('"result_text" TEXT');
  });

  it("implements owner-scoped preview, entitlement gate, generation, save, export and delete routes", () => {
    const route = source("src/app/api/products/deep-report/route.ts");
    const itemRoute = source("src/app/api/products/deep-report/[id]/route.ts");
    const exportRoute = source("src/app/api/products/deep-report/[id]/export/route.ts");

    expect(route).toContain('action: z.enum(["preview", "generate"])');
    expect(route).toContain('productKey: PRODUCT_KEY');
    expect(route).toContain("userHasActiveEntitlement(userId, PRODUCT_KEY)");
    expect(route).toContain('code: "PAYMENT_REQUIRED"');
    expect(route).toContain("generateDeepReport");
    expect(itemRoute).toContain('action: z.enum(["save"])');
    expect(itemRoute).toContain('status: "DELETED"');
    expect(exportRoute).toContain('Content-Disposition');
    expect(`${route}\n${itemRoute}\n${exportRoute}`).toContain("userId");
  });

  it("wires the product detail page and dialogue result into the deep report flow", () => {
    const detailPage = source("src/app/products/[slug]/page.tsx");
    const actions = source("src/components/products/deep-report-actions.tsx");
    const dialoguePage = source("src/app/checkin/page.tsx");

    expect(detailPage).toContain("<DeepReportActions");
    expect(actions).toContain('data-testid="deep-report-actions"');
    expect(actions).toContain("/api/products/deep-report");
    expect(actions).toContain("<ProductPurchaseControls");
    expect(actions).toContain('checkoutSource="deep-report-generate"');
    expect(actions).toContain("Сохранить в Мою карту");
    expect(dialoguePage).toContain("/products/deep-report?dialogueId=${dialogue.id}");
  });
});
