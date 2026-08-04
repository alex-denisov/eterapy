/**
 * B648 — корпус услуг стал материалом библиотеки.
 *
 * B647 снял описательный блок со страницы услуги: страница услуги — инструмент
 * на один экран. Текст при этом рабочий, и владелец сказал, где ему место:
 * библиотека «должна стать посадочной страницей для кучи разного SEO».
 *
 * Прогон держит три обещания: текст не потерян; он не вернулся на страницу
 * услуги; и он существует ровно в одном месте, а не переписан во второй раз.
 */

import fs from "node:fs";
import path from "node:path";
import { getApprovedLibraryEntry } from "@/data/anonymous-library";
import { serviceGuideLibraryEntries } from "@/data/library-service-guides";
import {
  SERVICE_GUIDES,
  SERVICE_GUIDE_LIBRARY_SLUG,
  serviceGuideBySlug,
  serviceGuideLibraryHref,
} from "@/lib/service-guides";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

const SERVICES = ["chat-analysis", "tarot", "natal-chart", "compatibility-by-date", "numerology"] as const;

describe("B648 · корпус не потерян", () => {
  it("у каждой услуги с корпусом есть живая запись библиотеки", () => {
    for (const service of SERVICES) {
      expect(SERVICE_GUIDES[service]).toBeDefined();
      const slug = SERVICE_GUIDE_LIBRARY_SLUG[service];
      expect(slug).toBeTruthy();
      // Запись именно ОПУБЛИКОВАННАЯ: черновик не является посадочной страницей.
      expect(getApprovedLibraryEntry(slug as string)).toBeDefined();
    }
  });

  it("записей ровно столько, сколько услуг с корпусом", () => {
    expect(serviceGuideLibraryEntries).toHaveLength(SERVICES.length);
  });

  it("запись находится по слагу и ведёт к своей услуге", () => {
    const found = serviceGuideBySlug(SERVICE_GUIDE_LIBRARY_SLUG.tarot as string);
    expect(found?.service).toBe("tarot");
    expect(serviceGuideLibraryHref("tarot")).toBe(`/library/${SERVICE_GUIDE_LIBRARY_SLUG.tarot}`);
  });

  it("услуга без корпуса ссылки не получает — пустая страница хуже её отсутствия", () => {
    expect(serviceGuideLibraryHref("reframe")).toBeNull();
    expect(serviceGuideBySlug("ne-mogu-reshitsya-na-razgovor")).toBeNull();
  });
});

describe("B648 · текст не вернулся на страницу услуги", () => {
  it("компонента описательного блока больше нет в дереве", () => {
    expect(fs.existsSync(path.join(process.cwd(), "src/components/products/product-seo-content.tsx"))).toBe(false);
  });

  it("со страницы услуги ведёт ОДНА ссылка, а не блок", () => {
    // ⚠ ОБЕ шапки. У `/products/[slug]` собственный компактный герой (B647), а
    // не `ProductPageShell`. Первая версия B648 знала только про шелл — на
    // живой странице услуги ссылки не было, и прогоны этого не увидели, потому
    // что проверяли один файл из двух. Поймано браузерной проверкой стенда.
    for (const file of [
      "src/components/products/product-page-shell.tsx",
      "src/app/products/[slug]/page.tsx",
    ]) {
      const source = read(file);
      expect(source).toContain("serviceGuideLibraryHref");
      expect(source).toContain('data-testid="product-guide-link"');
      // Признак возврата блока: страница услуги начала бы печатать разделы корпуса.
      expect(source).not.toContain("guide.usefulFor");
      expect(source).not.toContain("guide.faqs");
    }
  });
});

describe("B648 · корпус живёт в одном месте", () => {
  it("запись не переписывает текст корпуса, а берёт его", () => {
    const data = read("src/data/library-service-guides.ts");
    expect(data).toContain("guide.answer");
    expect(data).toContain("guide.faqs");
    // Абзац корпуса, скопированный сюда руками, разошёлся бы с оригиналом.
    expect(data).not.toContain("Анализ переписки помогает отделить");
  });

  it("FAQ записи — это FAQ корпуса, поэтому разметка страницы строится из них", () => {
    for (const entry of serviceGuideLibraryEntries) {
      const guide = serviceGuideBySlug(entry.slug);
      expect(entry.faqs).toBe(guide?.guide.faqs);
      expect(entry.faqs?.length).toBeGreaterThan(0);
    }
  });

  it("второй FAQPage на странице записи не появляется", () => {
    // Маршрут уже строит FAQPage из entry.faqs. Дублирующая разметка на одной
    // странице — прямой повод для поисковика проигнорировать обе.
    // Проверяем САМУ РАЗМЕТКУ, а не слово: в файле есть комментарий, почему
    // второго FAQPage быть не должно, и запрет на слово ловил бы объяснение.
    const sections = read("src/components/library/service-guide-sections.tsx");
    expect(sections).not.toContain('"@type": "FAQPage"');
    expect(sections).not.toContain("application/ld+json");
  });
});

describe("B648 · запись читается как материал, а не как карточка-вопрос", () => {
  it("блок корпуса показывает все разделы, ради которых текст писался", () => {
    const sections = read("src/components/library/service-guide-sections.tsx");
    for (const field of ["guide.usefulFor", "guide.process", "guide.interpretation", "guide.examples", "guide.boundary", "guide.faqs", "guide.related"]) {
      expect(sections).toContain(field);
    }
  });

  it("граница формата стоит ДО предложения его открыть", () => {
    const sections = read("src/components/library/service-guide-sections.tsx");
    expect(sections.indexOf("guide.boundary")).toBeLessThan(sections.indexOf("serviceHref && serviceName"));
  });

  it("блок появляется только у записей с корпусом", () => {
    const page = read("src/app/library/[slug]/page.tsx");
    expect(page).toContain("{guide && (");
  });
});
