import fs from "node:fs";
import path from "node:path";
import { STRATEGIC_KEYWORDS } from "@/lib/search-marketing-data";

const source = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("B578 — SEO/GEO content operations", () => {
  it("tracks a broad, landing-owned semantic core", () => {
    expect(STRATEGIC_KEYWORDS.length).toBeGreaterThanOrEqual(20);
    expect(STRATEGIC_KEYWORDS.every((keyword) => keyword.landing.startsWith("/"))).toBe(true);
    expect(new Set(STRATEGIC_KEYWORDS.map((keyword) => keyword.phrase)).size).toBe(STRATEGIC_KEYWORDS.length);
    expect(STRATEGIC_KEYWORDS).toEqual(expect.arrayContaining([
      expect.objectContaining({ phrase: "матрица судьбы рассчитать", landing: "/products/numerology" }),
      expect.objectContaining({ phrase: "таро онлайн", landing: "/products/tarot" }),
      expect.objectContaining({ phrase: "ии психолог", landing: "/ai-psychologist" }),
    ]));
  });

  it("adds answer-first supporting content and FAQ schema to priority products", () => {
    const content = source("src/components/products/product-seo-content.tsx");
    const productPage = source("src/app/products/[slug]/page.tsx");
    for (const slug of ["chat-analysis", "tarot", "natal-chart", "synastry", "numerology"]) {
      expect(content).toMatch(new RegExp(`["']?${slug}["']?: \\{`));
    }
    expect(content).toContain('"@type": "FAQPage"');
    expect(content).toContain("Примеры живых вопросов");
    expect(productPage).toContain("<ProductSeoContent");
  });

  it("uses query-led titles without claiming prediction or diagnosis", () => {
    const seo = source("src/lib/public-page-seo.ts");
    expect(seo).toContain("Матрица судьбы: рассчитать онлайн с расшифровкой | ETerapy");
    expect(seo).toContain("Расклад Таро онлайн: карты и разбор ситуации | ETerapy");
    expect(seo).toContain("Натальная карта онлайн: рассчитать с расшифровкой | ETerapy");
    expect(seo).toContain("Совместимость по дате рождения: синастрия онлайн | ETerapy");
  });

  it("exposes beginner symbolic FAQs and machine-readable pricing", () => {
    const library = source("src/app/library/page.tsx");
    const llms = source("src/lib/llms-content.ts");
    const sitemap = source("src/app/sitemap.xml/route.ts");
    expect(library).toContain("Что такое арканы Таро?");
    expect(library).toContain("Чем отличаются расклады Таро?");
    expect(llms).toContain('link("/pricing.md"');
    expect(sitemap).toContain('"/pricing.md"');
  });
});

describe("B607 — ядро из 50 замеренных запросов, без прочерков", () => {
  it("ровно 50 фраз, и у каждой есть живой замер", () => {
    // Владелец 2026-07-27: «я хочу чтобы там были только запросы, которые ты
    // проанализировал через yandex-mcp и у которых реальный спрос есть …
    // топ-50 запросов нашего направления». Фраза без замера в ядро не
    // попадает — прочерков в графе спроса больше не бывает по построению.
    expect(STRATEGIC_KEYWORDS).toHaveLength(50);
    for (const keyword of STRATEGIC_KEYWORDS) {
      expect(keyword.verifiedDemand).toBeGreaterThan(0);
    }
  });

  it("мёртвые и чужие фразы прошлого ядра не вернулись", () => {
    const phrases = STRATEGIC_KEYWORDS.map((keyword) => keyword.phrase);
    // «кармический код фамилии» — ровно 0 показов.
    // «разбор переписки» — 323, и это школьный морфемный разбор.
    // «какой расклад таро выбрать» — 64.
    // «хорарная астрология» — 5 492, в топе «фроули/учебник/скачать»: студенты.
    for (const dead of [
      "кармический код фамилии",
      "разбор переписки",
      "какой расклад таро выбрать",
      "хорарная астрология",
    ]) {
      expect(phrases).not.toContain(dead);
    }
  });

  it("нижняя граница спроса поднята: ядро не держит фразы мельче тысячи", () => {
    const weakest = Math.min(...STRATEGIC_KEYWORDS.map((k) => k.verifiedDemand ?? 0));
    expect(weakest).toBeGreaterThanOrEqual(1_000);
  });

  it("каждая фраза ведёт на существующий раздел, а не в никуда", () => {
    const allowedPrefixes = ["/products/", "/library", "/ai-psychologist", "/checkin"];
    for (const keyword of STRATEGIC_KEYWORDS) {
      expect(allowedPrefixes.some((prefix) => keyword.landing.startsWith(prefix))).toBe(true);
    }
  });
});
