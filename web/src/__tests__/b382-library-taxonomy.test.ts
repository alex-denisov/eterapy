import { approvedLibraryEntries, anonymousLibraryEntries, libraryTopics } from "@/data/anonymous-library";
import {
  LIBRARY_TOPICS,
  isLibraryTopic,
  resolveLibraryCta,
  topicDefaultProduct,
  type LibraryTopic,
} from "@/lib/library-cta";
import { getProductCreditCost, getProductPriceLabel } from "@/lib/product-prices";

// Legacy labels that B382 retired — none may survive in published cards.
const RETIRED_TOPICS = [
  "Паттерны",
  "Семья",
  "Самочувствие",
  "Тревога", // bare, без «и состояние»
  "Дружба",
  "Деньги",
  "Работа", // bare, без «и деньги»
  "Самооценка",
  "Родительство",
];

describe("B382 — library life-stage taxonomy", () => {
  it("every approved entry uses one of the 7 canonical themes", () => {
    for (const entry of approvedLibraryEntries()) {
      expect(isLibraryTopic(entry.topic)).toBe(true);
      expect(LIBRARY_TOPICS).toContain(entry.topic);
    }
  });

  it("no published card keeps a retired label (incl. «Паттерны»)", () => {
    const published = anonymousLibraryEntries.filter((e) => e.status === "approved");
    for (const entry of published) {
      expect(RETIRED_TOPICS).not.toContain(entry.topic);
    }
  });

  it("libraryTopics() is a subset of the canonical list in canonical order", () => {
    const topics = libraryTopics();
    expect(topics).toEqual(LIBRARY_TOPICS.filter((t) => topics.includes(t)));
  });
});

describe("B382 — topic→service CTA funnel", () => {
  it("maps each theme to a real priced product", () => {
    for (const topic of LIBRARY_TOPICS) {
      const cta = resolveLibraryCta({ topic });
      expect(cta.productPath).toMatch(/^\/products\/[a-z-]+\?from=library/);
      expect(cta.priceCredits).toBeGreaterThan(0);
      expect(cta.priceLabel).toMatch(/₽$/);
    }
  });

  it("derives credits/₽ from the B366 single price source (no drift)", () => {
    for (const topic of LIBRARY_TOPICS) {
      const cta = resolveLibraryCta({ topic });
      expect(cta.priceCredits).toBe(getProductCreditCost(cta.slug));
      expect(cta.priceLabel).toBe(getProductPriceLabel(cta.slug));
    }
  });

  it("teaser microcopy states the honest price only (no free-fragment promise, B454)", () => {
    const cta = resolveLibraryCta({ topic: "Повторяется одно и то же" }); // → Переосмысление, 1 балл, 299 ₽
    expect(cta.product).toBe("Переосмысление");
    expect(cta.teaserNote).toBe("разбор вашего вопроса — 1 балл (299 ₽)");
  });

  it("honours per-card ctaProduct override (Отношения → Вместе)", () => {
    const cta = resolveLibraryCta({ topic: "Отношения", ctaProduct: "Вместе" });
    expect(cta.slug).toBe("pair");
    // default would have been Разбор переписки
    expect(topicDefaultProduct("Отношения")).toBe("Разбор переписки");
  });

  it("embeds the source slug for funnel attribution", () => {
    const cta = resolveLibraryCta({ topic: "Работа и деньги", fromSlug: "stoyu-pered-vyborom-raboty" });
    expect(cta.productPath).toContain("from=library");
    expect(cta.productPath).toContain("slug=stoyu-pered-vyborom-raboty");
  });
});

describe("B382 — v2 card fields are well-formed when present", () => {
  it("any entry with mainFork has a non-empty title and seo metadata", () => {
    const v2 = anonymousLibraryEntries.filter((e) => e.mainFork);
    for (const entry of v2) {
      expect(entry.mainFork?.title?.length ?? 0).toBeGreaterThan(0);
      if (entry.seo) {
        expect(entry.seo.metaTitle.length).toBeLessThanOrEqual(70);
        expect(entry.seo.metaDescription.length).toBeLessThanOrEqual(170);
      }
    }
  });

  it("every entry topic is a valid LibraryTopic at the type level", () => {
    const sample: LibraryTopic = anonymousLibraryEntries[0].topic;
    expect(LIBRARY_TOPICS).toContain(sample);
  });
});
