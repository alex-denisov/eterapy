import fs from "node:fs";
import path from "node:path";
import { STRATEGIC_KEYWORDS } from "@/lib/search-marketing-data";
import { SEMANTIC_CORE } from "@/lib/seo/semantic-core-index";
import { publicPageSeo, type PublicSeoRoute } from "@/lib/public-page-seo";

const source = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("B578 — SEO/GEO content operations", () => {
  it("tracks a broad, landing-owned semantic core", () => {
    expect(STRATEGIC_KEYWORDS.length).toBeGreaterThanOrEqual(20);
    expect(STRATEGIC_KEYWORDS.every((keyword) => keyword.landing.startsWith("/"))).toBe(true);
    expect(new Set(STRATEGIC_KEYWORDS.map((keyword) => keyword.phrase)).size).toBe(STRATEGIC_KEYWORDS.length);
    expect(STRATEGIC_KEYWORDS).toEqual(expect.arrayContaining([
      expect.objectContaining({ phrase: "матрица судьбы", landing: "/products/numerology" }),
      expect.objectContaining({ phrase: "таро онлайн", landing: "/products/tarot" }),
      expect.objectContaining({ phrase: "ии психолог", landing: "/ai-psychologist" }),
    ]));
  });

  // B647 / владелец 2026-08-04 отменил половину B578: корпус на странице услуги
  // не рендерится — она инструмент на один экран. B648 довёл дело до конца:
  // корпус стал ДАННЫМИ (`lib/service-guides.ts`) и переехал в библиотеку,
  // компонента `product-seo-content.tsx` больше нет вовсе.
  it("keeps the supporting corpus but never renders it on a service page", () => {
    const content = source("src/lib/service-guides.ts");
    const productPage = source("src/app/products/[slug]/page.tsx");
    for (const slug of ["chat-analysis", "tarot", "natal-chart", "compatibility-by-date", "numerology"]) {
      expect(content).toMatch(new RegExp(`["']?${slug}["']?: \\{`));
    }
    // Раньше здесь проверялся ЗАГОЛОВОК блока на странице услуги. Блока больше
    // нет, поэтому проверяем сами данные и то, что их кто-то показывает:
    // корпус без читателя — мёртвый файл.
    expect(content).toContain("examples:");
    expect(source("src/components/library/service-guide-sections.tsx")).toContain("guide.examples.map");
    expect(productPage).not.toContain("<ProductSeoContent");
    // Разметка FAQ уходит вместе с видимым ответом: schema без текста на
    // странице — нарушение требований поисковика, а не «бесплатный плюс».
    expect(productPage).not.toContain('"@type": "FAQPage"');
    // Компонент удалён, а не оставлен «на всякий случай»: мёртвый экспорт —
    // приглашение вернуть блок обратно.
    expect(fs.existsSync(path.join(process.cwd(), "src/components/products/product-seo-content.tsx"))).toBe(false);
  });

  it("uses query-led titles without claiming prediction or diagnosis", () => {
    // Проверяем инвариант, а не пришпиленную копию. Прежняя версия сверяла
    // четыре заголовка дословно: любая правка текста роняла тест, ничего при
    // этом не защищая, — и наоборот, заголовок можно было испортить по смыслу,
    // сохранив строку. Инвариант ровно два: головной запрос кластера в
    // заголовке есть, обещания предсказания нет.
    const headTermByRoute = {
      "/products/numerology": "Матрица судьбы",
      "/products/tarot": "Расклад Таро",
      "/products/natal-chart": "Натальная карта",
      "/products/compatibility-by-date": "Совместимость по дате рождения",
    } as const;
    const forbidden = ["предсказ", "прогноз", "гаранти", "диагноз"];

    for (const [route, headTerm] of Object.entries(headTermByRoute)) {
      const { title } = publicPageSeo[route as PublicSeoRoute];
      expect({ route, headTerm, present: title.includes(headTerm) })
        .toEqual({ route, headTerm, present: true });
      for (const word of forbidden) {
        expect({ route, word, present: title.toLowerCase().includes(word) })
          .toEqual({ route, word, present: false });
      }
    }
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

describe("B608 — ядро по услугам: 50–150 фраз на услугу, порог 100 показов", () => {
  // Владелец 2026-07-27: «нужно чтобы по каждому из услуг ты делал полный поиск
  // слов из wordstat, пусть их будет не менее 50 по каждому, но не более 150
  // (только при условии что у всех у них есть не менее 100 просмотров в месяц)».
  it("каждая услуга несёт от 50 до 150 фраз", () => {
    expect(SEMANTIC_CORE.length).toBeGreaterThanOrEqual(13);
    for (const cluster of SEMANTIC_CORE) {
      expect(cluster.phrases.length).toBeGreaterThanOrEqual(50);
      expect(cluster.phrases.length).toBeLessThanOrEqual(150);
    }
  });

  it("ни одной фразы ниже 100 показов и ни одной без замера", () => {
    for (const keyword of STRATEGIC_KEYWORDS) {
      expect(keyword.verifiedDemand).toBeGreaterThanOrEqual(100);
    }
  });

  it("фразы не дублируются внутри услуги", () => {
    for (const cluster of SEMANTIC_CORE) {
      const phrases = cluster.phrases.map((item) => item.phrase);
      expect(new Set(phrases).size).toBe(phrases.length);
    }
  });

  it("мёртвые и чужие фразы прошлых ядер не вернулись", () => {
    const phrases = STRATEGIC_KEYWORDS.map((keyword) => keyword.phrase);
    // «кармический код фамилии» — ровно 0 показов.
    // «разбор переписки» — 323, и это школьный морфемный разбор.
    // «хорарная астрология» — 5 492, в топе «фроули/учебник/скачать»: студенты.
    // «рено аркана» и «арканы дота 2» — машина и игра под словом «аркан».
    for (const dead of [
      "кармический код фамилии",
      "разбор переписки",
      "хорарная астрология",
      "рено аркана",
      "арканы дота 2",
      "пособие по беременности и родам",
    ]) {
      expect(phrases).not.toContain(dead);
    }
  });

  it("каждая фраза ведёт на существующий раздел, а не в никуда", () => {
    const allowedPrefixes = ["/products/", "/library", "/ai-psychologist", "/checkin"];
    for (const keyword of STRATEGIC_KEYWORDS) {
      expect(allowedPrefixes.some((prefix) => keyword.landing.startsWith(prefix))).toBe(true);
    }
  });

  it("посадочные ядра совпадают с новыми слагами услуг (B609)", () => {
    const landings = new Set(SEMANTIC_CORE.map((cluster) => cluster.landing));
    for (const landing of [
      "/products/horoscope",
      "/products/surname-origin",
      "/products/family-questions",
      "/products/compatibility-by-date",
      "/products/arcana",
    ]) {
      expect(landings).toContain(landing);
    }
  });
});
