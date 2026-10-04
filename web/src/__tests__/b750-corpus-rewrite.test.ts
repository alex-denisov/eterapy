/**
 * B750 — переписанные страницы корпуса отвечают на целевую фразу, слитые
 * карточки сняты и ведут 301 на выжившего.
 */
import { anonymousLibraryEntries } from "@/data/anonymous-library";
import { serviceGuideLibraryEntries } from "@/data/library-service-guides";
import { symbolicLibraryCards } from "@/data/symbolic-library-cards";
import { SERVICE_GUIDES } from "@/lib/service-guides";
import nextConfig from "../../next.config";

const REWRITTEN = [
  "snitsya-byvshiy-hotya-ya-v-novyh-otnosheniyah",
  "snitsya-chto-vypadayut-zuby-pered-vazhnymi-sobytiyami",
  "umershiy-blizkiy-govorit-so-mnoy-vo-sne",
  "karta-dnya-ispugala-plohim-prognozom",
  "kak-razobrat-perepisku-i-ne-nakrutit-sebya",
];

const MERGED: Record<string, string> = {
  "natalnaya-karta-obeshchaet-slozhnye-otnosheniya": "/library/chto-pokazyvaet-natalnaya-karta",
  "nizkaya-sovmestimost-po-date-no-my-schastlivy": "/library/sovmestimost-po-date-rozhdeniya-chto-eto-znachit",
  "goroskop-sovmestimosti-govorit-chto-my-ne-para": "/library/sovmestimost-po-date-rozhdeniya-chto-eto-znachit",
};

const bySlug = (slug: string) => [...symbolicLibraryCards, ...serviceGuideLibraryEntries].find((e) => e.slug === slug);

describe("B750 переписанные страницы", () => {
  it.each(REWRITTEN)("%s: title ≤60, description 120–160, 3 FAQ", (slug) => {
    const entry = bySlug(slug)!;
    expect(entry).toBeDefined();
    expect(entry.seo!.metaTitle.length).toBeLessThanOrEqual(60);
    const d = entry.seo!.metaDescription.length;
    expect(d).toBeGreaterThanOrEqual(120);
    expect(d).toBeLessThanOrEqual(160);
    expect(entry.faqs).toHaveLength(3);
  });
});

describe("B750 слитые карточки", () => {
  it.each(Object.keys(MERGED))("%s снята из корпуса", (slug) => {
    expect(anonymousLibraryEntries.some((e) => e.slug === slug)).toBe(false);
    expect(symbolicLibraryCards.some((e) => e.slug === slug)).toBe(false);
  });

  it.each(Object.entries(MERGED))("%s → 301 на %s", async (slug, destination) => {
    const rules = await nextConfig.redirects!();
    expect(rules).toContainEqual({ source: `/library/${slug}`, destination, permanent: true });
    expect(anonymousLibraryEntries.some((e) => `/library/${e.slug}` === destination)).toBe(true);
  });

  it("выжившие несут перенесённые вопросы", () => {
    const natal = SERVICE_GUIDES["natal-chart"]!.faqs.map((f) => f.question);
    const compat = SERVICE_GUIDES["compatibility-by-date"]!.faqs.map((f) => f.question);
    expect(natal).toContain("Натальная карта обещает сложные отношения — это судьба?");
    expect(compat).toContain("Что делать, если совместимость по дате низкая, а мы счастливы?");
    expect(compat).toContain("Что делать, если гороскоп совместимости говорит, что мы не пара?");
  });
});
