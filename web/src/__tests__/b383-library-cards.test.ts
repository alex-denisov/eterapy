import { approvedLibraryEntries } from "@/data/anonymous-library";
import { b383LibraryCards } from "@/data/library-cards-b383";
import { LIBRARY_TOPICS, isLibraryTopic, type LibraryTopic } from "@/lib/library-cta";

// Appendix A target distribution for the published catalogue (120 cards).
const TARGET_DISTRIBUTION: Record<LibraryTopic, number> = {
  "Отношения": 30,
  "Хожу по кругу": 18,
  "Тревога и состояние": 18,
  "Работа и деньги": 16,
  "Одиночество": 14,
  "Выбор и решения": 14,
  "Про себя": 10,
};

// Tone bans from Appendix A (matched case-insensitively, stem-level).
const FORBIDDEN_WORDS = ["ясност", "ракурс", "паттерн", "триггер", "ресурс", "проработ"];

describe("B383 — published library catalogue", () => {
  const approved = approvedLibraryEntries();

  it("publishes ~120 approved & indexable cards (Appendix A target)", () => {
    expect(approved.length).toBe(120);
  });

  it("matches the Appendix A theme distribution exactly", () => {
    const counts: Record<string, number> = {};
    for (const entry of approved) {
      counts[entry.topic] = (counts[entry.topic] ?? 0) + 1;
    }
    for (const topic of LIBRARY_TOPICS) {
      expect(counts[topic] ?? 0).toBe(TARGET_DISTRIBUTION[topic]);
    }
  });

  it("has globally unique, url-safe slugs", () => {
    const slugs = approved.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9-]+$/);
    }
  });
});

describe("B383 — new v2 cards schema & tone", () => {
  it("every new card is approved, indexable and uses a canonical theme", () => {
    for (const card of b383LibraryCards) {
      expect(card.status).toBe("approved");
      expect(card.indexable).toBe(true);
      expect(isLibraryTopic(card.topic)).toBe(true);
    }
  });

  it("every new card is single-canvas ready (mainFork + freeFragment + seo)", () => {
    for (const card of b383LibraryCards) {
      expect((card.mainFork?.title ?? "").length).toBeGreaterThan(10);
      expect((card.freeFragment ?? "").length).toBeGreaterThan(10);
      expect(card.seo?.metaTitle).toBeTruthy();
      expect(card.seo?.metaDescription).toBeTruthy();
    }
  });

  it("keeps SEO fields within search-friendly limits", () => {
    for (const card of b383LibraryCards) {
      expect(card.seo!.metaTitle.length).toBeLessThanOrEqual(60);
      expect(card.seo!.metaDescription.length).toBeLessThanOrEqual(155);
    }
  });

  it("honours the Appendix A tone bans (no forbidden stems)", () => {
    for (const card of b383LibraryCards) {
      const blob = [
        card.question,
        card.summary,
        card.mainFork?.title ?? "",
        card.freeFragment ?? "",
        card.seo?.metaTitle ?? "",
        card.seo?.metaDescription ?? "",
      ]
        .join(" ")
        .toLowerCase();
      for (const word of FORBIDDEN_WORDS) {
        expect(blob).not.toContain(word);
      }
    }
  });

  it("uses first-person questions that are not duplicated", () => {
    const questions = b383LibraryCards.map((c) => c.question);
    expect(new Set(questions).size).toBe(questions.length);
  });
});
