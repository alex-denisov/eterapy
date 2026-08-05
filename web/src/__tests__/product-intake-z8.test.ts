import fs from "node:fs";
import path from "node:path";
import { v5Products } from "@/lib/v5-products";

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("Z8 product-local dialogue intake", () => {
  it("removes the old checkin nextProduct handoff", () => {
    const checkin = source("src/components/dialogue/checkin-experience.tsx");
    const productPage = source("src/app/products/[slug]/page.tsx");
    const productActions = [
      "src/components/products/deep-report-actions.tsx",
      "src/components/products/reframe-actions.tsx",
      "src/components/products/compatibility-actions.tsx",
    ].map(source).join("\n");

    expect(checkin).not.toContain("nextProduct");
    expect(checkin).not.toContain("dialogue_handoff_to_product");
    expect(productPage).not.toContain("nextProduct=");
    expect(productActions).not.toContain("nextProduct=");
  });

  // B441/B442 (M28): «Переосмысление» и «Подробный разбор» больше НЕ используют
  // ProductIntake/первичный диалог — контекст собирается внутри услуги. ProductIntake
  // остаётся только у диалог-зависимых форматов («Совместимость»/«Вместе»).
  it("makes reframe & deep-report self-contained, keeping ProductIntake only for dialogue-backed products", () => {
    const intake = source("src/components/products/product-intake.tsx");
    const detailPage = source("src/app/products/[slug]/page.tsx");
    const shell = source("src/components/products/product-page-shell.tsx");
    const deepReport = source("src/components/products/deep-report-actions.tsx");
    const reframe = source("src/components/products/reframe-actions.tsx");
    const compatibility = source("src/components/products/compatibility-actions.tsx");

    expect(intake).toContain('testId = "product-intake"');
    expect(intake).toContain("intakeProductKey");

    expect(detailPage).toContain("<ProductActionSurface");
    expect(detailPage).toContain("<ReframeActions");
    expect(shell).toContain('data-testid="product-service-start"');

    // self-contained: no checkin/ProductIntake, own sourceText intake
    expect(deepReport).not.toContain("ProductIntake");
    expect(deepReport).toContain('productKey="deep-report"');
    expect(deepReport).toContain("sourceText");
    expect(reframe).not.toContain("ProductIntake");
    expect(reframe).toContain('productKey="reframe"');
    expect(reframe).toContain("sourceText");

    // dialogue-backed product still uses ProductIntake
    expect(compatibility).toContain('mode="light"');
    expect(compatibility).toContain('productKey={productKey}');
  });

  it("keeps «Вместе» direct entry and closes the standalone circle product (B385)", () => {
    const products = source("src/lib/v5-products.ts");
    const pairPage = source("src/app/products/pair/page.tsx");

    expect(v5Products.find((product) => product.slug === "pair")?.directHref).toBe("/products/pair");
    // «Круг ясности» merged into «Вместе» — no standalone catalogue card and the route 404s.
    // B674: имя отображаемое, слаг `pair` — ключ биллинга, он не менялся.
    expect(v5Products.find((product) => product.slug === "pair")?.name).toBe("Разбор для двоих");
    expect(products).not.toContain('slug: "circle"');
    expect(products).not.toContain('directHref: "/checkin?entry=pair"');
    expect(pairPage).not.toContain("/checkin?entry=pair");
    // B373: the circle product page file is removed; the route 404s via the proxy.
    expect(fs.existsSync(path.join(root, "src/app/products/circle/page.tsx"))).toBe(false);
  });
});
