import fs from "node:fs";
import path from "node:path";
import { aiComplete } from "@/lib/ai";
import { publicPageSeo } from "@/lib/public-page-seo";
import { publicSeoRoutes } from "@/lib/seo";
import { getProductCreditCost, getProductPriceKopecks } from "@/lib/entitlements";
import { v5Products } from "@/lib/v5-products";
import {
  buildSynastryTeaser,
  generateSynastryResult,
} from "@/lib/synastry";

jest.mock("@/lib/ai", () => ({
  aiComplete: jest.fn(),
}));

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const mockAiComplete = aiComplete as jest.MockedFunction<typeof aiComplete>;

describe("Z14 synastry product", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("registers synastry pricing, credits, product metadata, and SEO route", () => {
    expect(getProductPriceKopecks("synastry")).toBe(99_000);
    expect(getProductCreditCost("synastry")).toBe(5);

    const product = v5Products.find((item) => item.slug === "synastry");
    expect(product).toEqual(expect.objectContaining({
      slug: "synastry",
      route: "/products/synastry",
      name: "Совместимость по звёздам",
      price: "990 ₽",
      creditCost: 5,
      productKey: "synastry",
    }));
    expect(publicSeoRoutes).toContain("/products/synastry");
    expect(publicPageSeo["/products/synastry"].title).toContain("Совместимость по звёздам");
  });

  it("wires the public page, action component, API route, and catalogue surfaces", () => {
    const detailPage = source("src/app/products/[slug]/page.tsx");
    const actions = source("src/components/products/synastry-actions.tsx");
    const route = source("src/app/api/products/synastry/route.ts");
    const saveRoute = source("src/app/api/products/synastry/[id]/route.ts");
    const products = source("src/lib/v5-products.ts");
    const serviceCatalog = source("src/components/products/service-catalog.tsx");
    const pricing = source("src/app/pricing/pricing-plans.tsx");
    const showcase = source("src/components/landing/esoteric-showcase.tsx");
    const footer = source("src/components/footer.tsx");
    const map = source("src/lib/my-map.ts");
    const resultPage = source("src/app/cabinet/results/[id]/page.tsx");
    const taskPolicy = source("src/lib/ai-gateway/task-policy.ts");
    const prompts = source("src/lib/ai-gateway/prompts.ts");

    expect(detailPage).toContain("<SynastryActions");
    expect(detailPage).toContain('product.slug === "synastry"');
    expect(detailPage).toContain('data-testid="synastry-relationship-map"');
    expect(actions).toContain("/api/products/synastry");
    expect(actions).toContain("<ProductPurchaseControls");
    expect(actions).toContain("partnerBirthData");
    expect(route).toContain('const PRODUCT_KEY = "synastry"');
    expect(route).toContain("userHasActiveEntitlement");
    expect(route).toContain("generateSynastryResult");
    expect(route).toContain("buildSynastryTeaser");
    expect(saveRoute).toContain('productKey: "synastry"');
    expect(products).toContain('slug: "synastry"');
    expect(serviceCatalog).toContain("/products/synastry");
    expect(pricing).toContain("/products/synastry");
    expect(showcase).toContain("/products/synastry");
    expect(footer).toContain("/products/synastry");
    expect(map).toContain('synastry: "Совместимость по звёздам"');
    expect(resultPage).toContain('"synastry": "Совместимость по звёздам"');
    expect(taskPolicy).toContain('feature: "product-synastry"');
    expect(prompts).toContain('"product-synastry"');
  });

  it("generates a non-fatalistic synastry result through AI with a safe fallback", async () => {
    mockAiComplete.mockResolvedValueOnce({
      text: [
        "Совместимость по звёздам",
        "",
        "Главное совпадение: оба быстрее успокаиваются, когда разговор становится конкретным.",
        "Главное различие: один ищет паузу, другой — немедленное подтверждение близости.",
        "Практический шаг: договориться о короткой фразе, которая означает «я рядом, но мне нужно время».",
      ].join("\n"),
      provider: "openai" as never,
      model: "gpt-test",
      tokensIn: 100,
      tokensOut: 120,
      latencyMs: 50,
    });

    const generated = await generateSynastryResult({
      userBirthData: "12.04.1992, 14:35, Москва",
      partnerBirthData: "09.11.1990, 08:10, Санкт-Петербург",
      question: "Почему мы часто ссоримся перед важными решениями?",
      userId: "user-1",
      requestId: "req-1",
    });

    expect(generated.text).toContain("Главное совпадение");
    expect(generated.metadata).toEqual(expect.objectContaining({ source: "ai", provider: "openai" }));
    expect(mockAiComplete).toHaveBeenCalledWith(expect.objectContaining({
      feature: "product-synastry",
      userId: "user-1",
    }));

    const teaser = buildSynastryTeaser({
      userBirthData: "12.04.1992, 14:35, Москва",
      partnerBirthData: "09.11.1990, 08:10, Санкт-Петербург",
      generatedText: generated.text,
    });
    expect(teaser).toContain("Один акцент совместимости по звёздам");
    expect(teaser).toContain("Полная совместимость по звёздам");
  });
});
