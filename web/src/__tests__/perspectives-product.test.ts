import fs from "node:fs";
import path from "node:path";
import { buildPerspectivesPreview, heuristicPerspectives } from "@/lib/perspectives";

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("B086 perspectives product", () => {
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
    const preview = buildPerspectivesPreview(dialogue);
    const report = heuristicPerspectives(dialogue);

    expect(preview).toContain("Предпросмотр 4 ракурсов");
    expect(preview).toContain("Запрос: Стоит ли менять работу сейчас?");
    expect(report).toContain("4 ракурса ответа");
    expect(report).toContain("1. Рациональный ракурс");
    expect(report).toContain("4. Практический ракурс");
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
    const route = source("src/app/api/products/perspectives/route.ts");
    const itemRoute = source("src/app/api/products/perspectives/[id]/route.ts");
    const exportRoute = source("src/app/api/products/perspectives/[id]/export/route.ts");

    expect(route).toContain('action: z.enum(["preview", "generate"])');
    expect(route).toContain('productKey: PRODUCT_KEY');
    expect(route).toContain("userHasActiveEntitlement(userId, PRODUCT_KEY)");
    expect(route).toContain('code: "PAYMENT_REQUIRED"');
    expect(route).toContain("generatePerspectives");
    expect(itemRoute).toContain('action: z.enum(["save"])');
    expect(itemRoute).toContain('status: "DELETED"');
    expect(exportRoute).toContain('Content-Disposition');
    expect(`${route}\n${itemRoute}\n${exportRoute}`).toContain("userId");
  });

  it("wires the product detail page and dialogue result into the perspectives flow", () => {
    const detailPage = source("src/app/products/[slug]/page.tsx");
    const actions = source("src/components/products/perspectives-actions.tsx");
    const dialoguePage = source("src/app/all-modalities/checkin/page.tsx");

    expect(detailPage).toContain("<PerspectivesActions");
    expect(actions).toContain('data-testid="perspectives-actions"');
    expect(actions).toContain("/api/products/perspectives");
    expect(actions).toContain("/api/billing/create-payment");
    expect(actions).toContain("Сохранить в Мою карту");
    expect(dialoguePage).toContain("/products/perspectives?dialogueId=${dialogue.id}");
  });
});
