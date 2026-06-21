import { sanitizeTarotReading } from "@/lib/tarot-reading-format";

describe("sanitizeTarotReading", () => {
  it("removes the standalone orientation line and the per-card question, keeps the meaning", () => {
    const text = [
      "**Сейчас — Тройка Жезлов**",
      "* Прямое положение.",
      "* Карта говорит о прогрессе и развитии текущих проектов.",
      "* Что вы делаете для продвижения своего стартапа сейчас?",
      "",
      "**Вызов — Шестёрка Мечей**",
      "* Перевёрнутое положение.",
      "* Карта указывает на препятствия и задержки.",
      "* Какие трудности вы встречаете на пути?",
    ].join("\n");

    const result = sanitizeTarotReading(text);

    expect(result).toContain("Сейчас — Тройка Жезлов");
    expect(result).toContain("Карта говорит о прогрессе");
    expect(result).toContain("Карта указывает на препятствия");
    expect(result).not.toContain("Прямое положение");
    expect(result).not.toContain("Перевёрнутое положение");
    expect(result).not.toContain("Что вы делаете");
    expect(result).not.toContain("Какие трудности");
    expect(result).not.toContain("?");
  });

  it("keeps the «Общий смысл» synthesis paragraph intact", () => {
    const text = "**Итог — Восьмёрка Жезлов**\n* Карта символизирует движение.\n\n### Общий смысл\nКарты складываются в одну линию вашей ситуации.";
    const result = sanitizeTarotReading(text);
    expect(result).toContain("Общий смысл");
    expect(result).toContain("складываются в одну линию");
  });

  it("does not touch a richer reading written as prose without questions", () => {
    const text = "## Прошлое — Солнце\nВ позиции прошлого Солнце говорит об опыте, который стал опорой. Этот успех всё ещё питает вашу уверенность сегодня.";
    expect(sanitizeTarotReading(text)).toBe(text.trim());
  });

  it("is a no-op on empty input", () => {
    expect(sanitizeTarotReading("")).toBe("");
  });
});
