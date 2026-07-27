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
    // B366: 890 ₽ / 3 балла (≈297 ₽/балл).
    expect(getProductPriceKopecks("compatibility-by-date")).toBe(89_000);
    expect(getProductCreditCost("compatibility-by-date")).toBe(3);

    const product = v5Products.find((item) => item.slug === "compatibility-by-date");
    expect(product).toEqual(expect.objectContaining({
      slug: "compatibility-by-date",
      route: "/products/compatibility-by-date",
      name: "Совместимость по дате",
      price: "890 ₽",
      creditCost: 3,
      productKey: "compatibility-by-date",
    }));
    expect(publicSeoRoutes).toContain("/products/compatibility-by-date");
    expect(publicPageSeo["/products/compatibility-by-date"].title).toContain("Совместимость по дате рождения");
    expect(publicPageSeo["/products/compatibility-by-date"].title).toContain("синастрия");
  });

  it("wires the public page, action component, API route, and catalogue surfaces", () => {
    const detailPage = source("src/app/products/[slug]/page.tsx");
    const actions = source("src/components/products/compatibility-by-date-actions.tsx");
    const route = source("src/app/api/products/compatibility-by-date/route.ts");
    const saveRoute = source("src/app/api/products/compatibility-by-date/[id]/route.ts");
    const products = source("src/lib/v5-products.ts");
    const serviceCatalog = source("src/components/products/service-catalog.tsx");
    const footer = source("src/components/footer.tsx");
    const map = source("src/lib/diary.ts");
    const resultPage = source("src/app/cabinet/results/[id]/page.tsx");
    const billingLabels = source("src/lib/billing-labels.ts");
    const taskPolicy = source("src/lib/ai-gateway/task-policy.ts");
    const prompts = source("src/lib/ai-gateway/prompts.ts");
    const shell = source("src/components/products/product-page-shell.tsx");

    expect(detailPage).toContain("<SynastryActions");
    expect(detailPage).toContain('product.slug === "compatibility-by-date"');
    // B395: decorative <SynastrySide> removed — the tool-first hero renders the
    // action component directly, no side preview panel.
    expect(shell).toContain('data-testid="product-service-start"');
    expect(detailPage).not.toContain('data-testid="synastry-relationship-map"');
    expect(actions).toContain("/api/products/compatibility-by-date");
    expect(actions).toContain("<ProductPurchaseControls");
    expect(actions).toContain("partnerBirthData");
    expect(route).toContain('const PRODUCT_KEY = "compatibility-by-date"');
    expect(route).toContain("userHasActiveEntitlement");
    expect(route).toContain("generateSynastryResult");
    expect(route).toContain("buildSynastryTeaser");
    expect(saveRoute).toContain('productKey: "compatibility-by-date"');
    expect(products).toContain('slug: "compatibility-by-date"');
    expect(serviceCatalog).toContain("/products/compatibility-by-date");
    // B374/B396: synastry surfaces via the /products catalog + footer — the
    // /pricing «разовые форматы» list that used to link it was removed in B396.
    expect(footer).toContain("/products/compatibility-by-date");
    expect(map).toContain('"compatibility-by-date": "Совместимость по дате"');
    expect(resultPage).toContain("getProductLabel(result.productKey)");
    expect(billingLabels).toContain('"compatibility-by-date": "Совместимость по дате"');
    expect(taskPolicy).toContain('feature: "product-compatibility-by-date"');
    expect(prompts).toContain('"product-compatibility-by-date"');
  });

  it("generates a non-fatalistic synastry result through AI with a safe fallback", async () => {
    const calculatedFacts = "Овен Телец Близнецы Рак Лев Дева Весы Скорпион Стрелец Козерог Водолей Рыбы ".repeat(20);
    mockAiComplete.mockResolvedValue({
      text: ["Прямой ответ", "Главная ось связи", "Эмоциональная совместимость", "Коммуникация", "Притяжение и близость", "Быт и устойчивость", "Конфликт, власть и границы", "Поддержка и рост", "Противоречия пары", "Сценарий в плюсе", "Сценарий в минусе", "Итог в выбранном слое отношений"]
        .map((heading) => `## ${heading}\n${calculatedFacts}`)
        .join("\n"),
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

    expect(generated.text).toContain("Главная ось связи");
    expect(generated.text).toContain("Прямой ответ");
    expect(generated.metadata).toEqual(expect.objectContaining({ source: "ai", provider: "openai" }));
    expect(mockAiComplete).toHaveBeenCalledWith(expect.objectContaining({
      feature: "product-compatibility-by-date",
      userId: "user-1",
    }));

    const teaser = buildSynastryTeaser({
      userBirthData: "12.04.1992, 14:35, Москва",
      partnerBirthData: "09.11.1990, 08:10, Санкт-Петербург",
      generatedText: generated.text,
    });
    expect(teaser).toContain("Один акцент совместимости по дате");
    expect(teaser).toContain("Полная совместимость по дате");
  });
});
