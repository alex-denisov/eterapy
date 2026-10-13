import {
  CTA_TARGETS, appendCtaPart, buildCtaLine, buildCtaUrl, resolveCtaTarget, isCtaEligibleLabel,
} from "@/lib/marketing/threads-cta";
import { getV5Product } from "@/lib/v5-products";

describe("B776 F4: CTA строит код", () => {
  it("в списке 13 услуг, /checkin и /ai-psychologist; /library нет нигде", () => {
    const slugs = CTA_TARGETS.map((target) => target.slug);
    expect(slugs).toEqual(expect.arrayContaining(["reframe", "deep-report", "chat-analysis", "pair", "tarot", "natal-chart",
      "compatibility-by-date", "horoscope", "arcana", "numerology", "family-questions", "human-design", "surname-origin",
      "checkin", "ai-psychologist"]));
    expect(CTA_TARGETS).toHaveLength(15);
    for (const target of CTA_TARGETS) expect(target.path).not.toMatch(/library/);
  });

  it("каждая услуга существует в каталоге продуктов", () => {
    for (const target of CTA_TARGETS.filter((item) => item.path.startsWith("/products/"))) {
      expect(getV5Product(target.slug)?.route).toBe(target.path);
    }
  });

  it("URL: threads/social/expert-chain и content=слаг", () => {
    expect(buildCtaUrl(resolveCtaTarget("tarot", ""))).toBe(
      "https://eterapy.com/products/tarot?utm_source=threads&utm_medium=social&utm_campaign=expert-chain&utm_content=tarot");
    expect(buildCtaUrl(resolveCtaTarget("checkin", ""))).toBe(
      "https://eterapy.com/checkin?utm_source=threads&utm_medium=social&utm_campaign=expert-chain&utm_content=checkin");
  });

  it("неизвестная цель (в том числе library и выдуманный адрес) -> подбор по тексту -> checkin", () => {
    expect(resolveCtaTarget("library", "ничего").slug).toBe("checkin");
    expect(resolveCtaTarget("https://evil.example/x", "ничего").slug).toBe("checkin");
    expect(resolveCtaTarget("whatever", "Разложила бы таро на неё").slug).toBe("tarot");
    expect(resolveCtaTarget(undefined, "Совместимость по дате рождения").slug).toBe("compatibility-by-date");
    expect(resolveCtaTarget("  TAROT ", "").slug).toBe("tarot");
  });

  it("строка: фраза + двоеточие + url, одна строка", () => {
    const line = buildCtaLine(resolveCtaTarget("pair", ""));
    expect(line).toMatch(/^Если у вас похожая ситуация — .+: https:\/\/eterapy\.com\/products\/pair\?/);
    expect(line).not.toContain("\n");
  });

  it("строка добавляется последней, ровно одна, ссылка в ней одна", () => {
    const out = appendCtaPart("Первая часть продолжения. Вторая часть.", { ctaTarget: "tarot", postText: "пост" });
    const lines = out.split("\n\n");
    expect(lines.at(-1)).toMatch(/^Если у вас похожая ситуация/);
    expect(out.match(/https?:\/\//g)).toHaveLength(1);
  });

  it("ссылка, придуманная моделью в продолжении, снимается: адрес только от кода", () => {
    const out = appendCtaPart("Текст. Смотри https://fake.example/library/x тут.", { ctaTarget: "checkin", postText: "" });
    expect(out).not.toContain("fake.example");
    expect(out).not.toContain("/library");
    expect(out.match(/https?:\/\//g)).toHaveLength(1);
  });

  it("повторный вызов не удваивает строку", () => {
    const once = appendCtaPart("Текст.", { ctaTarget: "tarot", postText: "" });
    expect(appendCtaPart(once, { ctaTarget: "tarot", postText: "" })).toBe(once);
  });

  it("право на CTA только у экспертных цепочек", () => {
    // Только форматы, существующие в библиотеке Threads (мини-практика/чек-лист/миф есть лишь в Telegram и VK).
    expect(isCtaEligibleLabel("Если бы ко мне пришёл запрос")).toBe(true);
    expect(isCtaEligibleLabel("серия «День N/30»")).toBe(true);
    for (const label of ["мини-практика на две минуты", "чек-лист", "миф и правда"]) expect(isCtaEligibleLabel(label)).toBe(false);
    expect(isCtaEligibleLabel("сатира над индустрией")).toBe(false);
    expect(isCtaEligibleLabel("оклик по знаку с прогнозом в ответе")).toBe(false);
  });
});

import { stripModelUrls } from "@/lib/marketing/threads-cta";

describe("B776 HIGH-2/3: снятие адресов, написанных моделью", () => {
  it("снимает схему, www. и голые домены, кириллицу не трогает", () => {
    expect(stripModelUrls("Смотри https://a.example/x и www.b.ru/y, ещё eterapy.com/products/tarot?x=1 тут")).toBe("Смотри и ещё тут");
    expect(stripModelUrls("Пиши в t.me/channel. Это важно")).not.toMatch(/t\.me/);
    expect(stripModelUrls("Привет. Как дела? Так и живём")).toBe("Привет. Как дела? Так и живём");
  });
  it("своя строка призыва модели с адресом заменяется кодовой", () => {
    const own = "Текст.\n\nЕсли у вас похожая ситуация — вот: https://evil.example/library/x";
    const out = appendCtaPart(own, { ctaTarget: "checkin", postText: "" });
    expect(out).not.toMatch(/evil|library/);
    expect(out.match(/Если у вас похожая ситуация/g)).toHaveLength(1);
    expect(out).toMatch(/eterapy\.com\/checkin\?utm_source=threads/);
  });
});
