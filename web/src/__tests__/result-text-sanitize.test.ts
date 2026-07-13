import { stripEmbeddedResultDisclaimers } from "@/lib/result-text-sanitize";

describe("stripEmbeddedResultDisclaimers", () => {
  it("removes astrology disclaimer sentences from persisted result text", () => {
    const text = [
      "## Дома и сферы жизни",
      "",
      "Второй дом показывает, где вы собираете ресурс и устойчивость.",
      "Однако важно помнить, что астрология не даёт точных прогнозов о будущем, а лишь предлагает направления для размышлений.",
      "",
      "## Следующий блок",
      "",
      "Здесь остается содержательная часть.",
    ].join("\n");

    const cleaned = stripEmbeddedResultDisclaimers(text);

    expect(cleaned).toContain("Второй дом показывает");
    expect(cleaned).toContain("## Следующий блок");
    expect(cleaned).not.toContain("астрология не даёт");
    expect(cleaned).not.toContain("направления для размышлений");
  });

  it("keeps useful non-disclaimer wording that starts with important-to-remember", () => {
    const text = "Важно помнить, что богатство может проявляться в навыках, связях и свободе выбора.";

    expect(stripEmbeddedResultDisclaimers(text)).toBe(text);
  });

  it("removes platform-level consultation disclaimers from main result content", () => {
    const text = [
      "## Ответ",
      "",
      "Разбор показывает главный конфликт и ближайший практический шаг.",
      "",
      "Этот материал носит информационно-рефлексивный характер и не заменяет консультацию специалиста.",
    ].join("\n");

    const cleaned = stripEmbeddedResultDisclaimers(text);

    expect(cleaned).toContain("главный конфликт");
    expect(cleaned).not.toContain("не заменяет консультацию");
  });
});
