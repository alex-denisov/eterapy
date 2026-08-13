import { ARCANA_GUIDES, arcanaGuideBySlug } from "@/lib/arcana";
import { arcanaLibraryCards } from "@/data/library-arcana-cards";
import { approvedLibraryEntries } from "@/data/anonymous-library";
import { v5Products } from "@/lib/v5-products";

describe("B710 — справочный корпус арканов", () => {
  const cardSlugs = new Set(arcanaLibraryCards.map((card) => card.slug));
  const librarySlugs = new Set(approvedLibraryEntries().map((entry) => entry.slug));
  const productRoutes = new Set(v5Products.map((product) => product.route));

  it("описывает ровно 22 энергии, по одной на число", () => {
    expect(ARCANA_GUIDES).toHaveLength(22);
    expect(ARCANA_GUIDES.map((guide) => guide.number)).toEqual(
      Array.from({ length: 22 }, (_, index) => index + 1),
    );
  });

  it("держит соответствие «корпус ↔ запись библиотеки» в обе стороны", () => {
    // Односторонняя проверка пропустила бы осиротевший корпус: страница есть,
    // а адреса у неё нет — ровно тот случай, который в B550 нашёлся живым
    // замером, а не прогоном.
    for (const guide of ARCANA_GUIDES) {
      expect(cardSlugs.has(guide.slug)).toBe(true);
    }
    for (const card of arcanaLibraryCards) {
      expect(arcanaGuideBySlug(card.slug)).not.toBeNull();
    }
  });

  it("публикует каждый аркан отдельным адресом библиотеки", () => {
    for (const card of arcanaLibraryCards) {
      expect(librarySlugs.has(card.slug)).toBe(true);
      expect(card.indexable).toBe(true);
      expect(card.topic).toBe("Матрица судьбы");
      expect(card.section).toBe("symbolic");
    }
    expect(cardSlugs.size).toBe(arcanaLibraryCards.length);
  });

  it("не оставляет сирот: каждая внутренняя ссылка корпуса ведёт на живой адрес", () => {
    for (const guide of ARCANA_GUIDES) {
      expect(guide.related.length).toBeGreaterThanOrEqual(2);
      for (const link of guide.related) {
        if (link.href.startsWith("/library/")) {
          expect(librarySlugs.has(link.href.replace("/library/", ""))).toBe(true);
        } else {
          expect(productRoutes.has(link.href)).toBe(true);
        }
      }
    }
  });

  it("ведёт из каждого аркана к расчёту матрицы", () => {
    for (const guide of ARCANA_GUIDES) {
      const hasProductLink = guide.related.some((link) => productRoutes.has(link.href));
      expect({ arcanum: guide.number, hasProductLink }).toEqual({
        arcanum: guide.number,
        hasProductLink: true,
      });
    }
  });

  it("отвечает на подзапросы, ради которых корпус и написан", () => {
    for (const guide of ARCANA_GUIDES) {
      // «N аркан в матрице», «в центре», «под сердцем», «на год»,
      // «в совместимости», «в плюсе и минусе» — замер Wordstat в тикете B710.
      expect(guide.positions.length).toBeGreaterThanOrEqual(5);
      expect(guide.positions[0].title).toContain("в центре матрицы");
      expect(guide.strengths.length).toBeGreaterThanOrEqual(4);
      expect(guide.distortions.length).toBeGreaterThanOrEqual(4);
      expect(guide.year.length).toBeGreaterThanOrEqual(120);
      expect(guide.compatibility.length).toBeGreaterThanOrEqual(120);
      expect(guide.answer.length).toBeGreaterThanOrEqual(200);
      expect(guide.boundary.length).toBeGreaterThanOrEqual(60);
    }
  });

  it("даёт каждому аркану собственный текст, а не подстановку числа в шаблон", () => {
    const answers = new Set(ARCANA_GUIDES.map((guide) => guide.answer));
    const headings = new Set(ARCANA_GUIDES.map((guide) => guide.heading));
    expect(answers.size).toBe(ARCANA_GUIDES.length);
    expect(headings.size).toBe(ARCANA_GUIDES.length);

    // Текст, у которого совпадает всё, кроме числа, — дорвей. Сверяем корпус
    // после вычёркивания номера и имени аркана.
    const skeletons = ARCANA_GUIDES.map((guide) =>
      [guide.answer, ...guide.positions.map((position) => position.text)]
        .join(" ")
        .replace(/\d+/g, "")
        .replace(new RegExp(guide.name, "gi"), ""),
    );
    expect(new Set(skeletons).size).toBe(ARCANA_GUIDES.length);
  });

  it("объясняет расхождение нумерации там, где оно реально есть", () => {
    // «8 аркан это Сила или Справедливость» — живой запрос, и ответ у него не
    // один: у Уэйта 8 — Сила, в матрице 8 — Справедливость. Молчать об этом
    // означает выглядеть ошибочным источником.
    for (const number of [8, 11, 22]) {
      const guide = ARCANA_GUIDES.find((item) => item.number === number);
      expect(guide?.confusion).toBeTruthy();
    }
  });

  it("держит FAQ записи на подзапросах и не оставляет его пустым", () => {
    for (const card of arcanaLibraryCards) {
      expect(card.faqs?.length ?? 0).toBeGreaterThanOrEqual(3);
      const guide = arcanaGuideBySlug(card.slug);
      const questions = (card.faqs ?? []).map((faq) => faq.question).join(" ");
      expect(questions).toContain(`${guide?.number} аркан`);
    }
  });

  it("не обещает событий и не выносит приговор", () => {
    // Правило корпуса: символическая система не предсказывает смерть, болезнь
    // и не даёт гарантий. Проверяем самые опасные формулировки.
    // Отрицание — не нарушение, а ровно то, чего мы и добиваемся: «не
    // гарантирует победу» обязано проходить, «гарантирует победу» — нет.
    const forbidden = [
      /(?<!не\s)гарантир/i,
      /(?<!не\s)обещает (?:успех|деньги|встречу)/i,
      /обязательно (?:произойдёт|случится)/i,
      /предсказывает будущее/i,
    ];
    for (const guide of ARCANA_GUIDES) {
      const text = [
        guide.answer,
        guide.year,
        guide.compatibility,
        guide.boundary,
        ...guide.essence,
        ...guide.strengths,
        ...guide.distortions,
        ...guide.positions.map((position) => position.text),
      ].join(" ");
      for (const pattern of forbidden) {
        expect({ arcanum: guide.number, matched: pattern.test(text) }).toEqual({
          arcanum: guide.number,
          matched: false,
        });
      }
    }
  });
});
