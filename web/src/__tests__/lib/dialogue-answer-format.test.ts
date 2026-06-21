import { stripDeepeningSection } from "@/lib/dialogue-answer-format";

describe("stripDeepeningSection", () => {
  it("removes a standalone «Если хочется глубже» block but keeps the safety note", () => {
    const text = [
      "Короткий ответ",
      "Похоже, важнее устойчивость, а не скорость.",
      "",
      "Мягкий следующий шаг",
      "Запишите два варианта и спокойный шаг к каждому.",
      "",
      "Если хочется глубже",
      "Если захочется глубже, подойдёт «Полная картина»: разложит ситуацию.",
      "",
      "Важно: это не медицинская, юридическая или финансовая рекомендация.",
    ].join("\n");

    const result = stripDeepeningSection(text);

    expect(result).not.toContain("Если хочется глубже");
    expect(result).not.toContain("Полная картина");
    expect(result).toContain("Мягкий следующий шаг");
    expect(result).toContain("Важно: это не медицинская");
  });

  it("removes an inline «Если хочется глубже:» recommendation paragraph", () => {
    const text = [
      "Короткий ответ: возможно, вашему другу сейчас тяжело.",
      "",
      "Если хочется глубже: «Подробный разбор» поможет увидеть картину целиком.",
    ].join("\n");

    const result = stripDeepeningSection(text);

    expect(result).not.toContain("Если хочется глубже");
    expect(result).not.toContain("Подробный разбор");
    expect(result).toContain("Короткий ответ");
  });

  it("removes a markdown-heading deepening section (## / **)", () => {
    const text = "## Что кажется важным\nВы цените честность.\n\n## Если хочется глубже\nПопробуйте «Таро».";
    const result = stripDeepeningSection(text);
    expect(result).not.toContain("Если хочется глубже");
    expect(result).not.toContain("Таро");
    expect(result).toContain("Что кажется важным");
  });

  it("keeps the deepening's preceding content when it trails another section in the same block", () => {
    const text = "Мягкий следующий шаг\nСделайте паузу.\nЕсли хочется глубже, подойдёт «Совместимость».";
    const result = stripDeepeningSection(text);
    expect(result).toContain("Сделайте паузу.");
    expect(result).not.toContain("Если хочется глубже");
    expect(result).not.toContain("Совместимость");
  });

  it("is a no-op for answers without the section", () => {
    const text = "Короткий ответ\nВсё в порядке.\n\nМягкий следующий шаг\nНебольшое действие.";
    expect(stripDeepeningSection(text)).toBe(text);
  });
});
