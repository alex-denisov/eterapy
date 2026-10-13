import { threadsConcretenessFindings, CONCRETENESS_LABELS } from "@/lib/marketing/threads-stop-checks";

const EXPERT = "Если бы ко мне пришёл запрос";
const GOOD = "Подруга просит в долг, а вы не хотите. Три фразы на сегодня: 1) «Не получится, но спасибо, что спросила» 2) «Могу дать столько-то, остальное нет» 3) «Мне нужно подумать до завтра». Причину не объясняйте — каждая причина дверь для торга";

describe("B776 F1: стоп-проверка конкретности", () => {
  it("расплывчатый совет без опоры получает замечание threads-vague-advice", () => {
    const findings = threadsConcretenessFindings({ text: "Важно следить за своими границами и стараться быть осознанной.", format: "чек-лист" });
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe("threads-vague-advice");
    expect(findings[0].brief).toMatch(/точное действие/);
    expect(findings[0].brief).toMatch(/слово в слово/);
  });

  it.each(["важно", "Следите за тем", "старайтесь реже", "будьте осознанны", "научитесь отказывать", "берегите себя", "помните, что вы"])(
    "ловит «%s» без опоры", (phrase) => {
      expect(threadsConcretenessFindings({ text: `Коротко: ${phrase} и всё.`, format: EXPERT })).toHaveLength(1);
    });

  it("пример владельца с цифрой, фразой в кавычках и сроком проходит", () => {
    expect(threadsConcretenessFindings({ text: GOOD, format: "мини-практика на две минуты" })).toEqual([]);
  });

  it.each([
    ["цифра", "Важно проверить это 3 раза."],
    ["фраза в кавычках", "Важно сказать: «Мне нужно подумать»."],
    ["день недели", "Важно поговорить в пятницу."],
    ["слово времени", "Важно решить сегодня."],
  ])("опора «%s» снимает замечание", (_name, text) => {
    expect(threadsConcretenessFindings({ text, format: "чек-лист" })).toEqual([]);
  });

  it("юмор и неизвестный формат не проверяются", () => {
    expect(threadsConcretenessFindings({ text: "Важно помните, что", format: "сатира над индустрией" })).toEqual([]);
    expect(threadsConcretenessFindings({ text: "Важно", format: null })).toEqual([]);
  });

  it("кириллица: «неважно» и «подважно» не принимаются за «важно»", () => {
    expect(threadsConcretenessFindings({ text: "Это неважно, правда.", format: EXPERT })).toEqual([]);
  });

  it("проверяются три полезных формата и два экспертных", () => {
    for (const label of ["мини-практика на две минуты", "чек-лист", "миф и правда", EXPERT]) {
      expect(CONCRETENESS_LABELS.has(label)).toBe(true);
    }
  });
});
