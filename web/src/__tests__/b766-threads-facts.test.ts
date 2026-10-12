/** B766 — слой фактов: считается кодом платформы, неизменяем, пост не выдумывает небо сверх факта. */
import {
  factFindings,
  factForWriter,
  gatherThreadsFacts,
  isRetrograde,
  moonPhaseKind,
  moonSignFact,
  needsThreadsFact,
  pickThreadsFact,
  tarotCardFact,
  threadsFactSchema,
} from "@/lib/marketing/threads-facts";

// 2026-10-12 12:00 МСК
const AT = new Date("2026-10-12T09:00:00.000Z");

describe("факты считаются кодом платформы", () => {
  it("факт Луны проходит схему, назван знак и срок, объект заморожен", () => {
    const fact = moonSignFact(AT);
    expect(threadsFactSchema.safeParse(fact).success).toBe(true);
    expect(fact.statement).toMatch(/^Луна в [А-Яа-яё]+/);
    expect(fact.subject.planet).toBe("moon");
    expect(Object.isFrozen(fact)).toBe(true);
    expect(() => { (fact as { statement: string }).statement = "x"; }).toThrow();
  });

  it("повторный расчёт на то же время даёт тот же факт, карта дня стабильна", () => {
    expect(moonSignFact(AT)).toEqual(moonSignFact(AT));
    expect(tarotCardFact(AT)).toEqual(tarotCardFact(new Date(AT.getTime() + 3_600_000)));
  });

  it("фазы Луны по углу", () => {
    expect(moonPhaseKind(2)).toBe("new");
    expect(moonPhaseKind(90)).toBe("waxing");
    expect(moonPhaseKind(180)).toBe("full");
    expect(moonPhaseKind(270)).toBe("waning");
  });

  it("известный ретроград: Меркурий осенью 2025 шёл назад (10.11 → 29.11), в начале октября — прямо", () => {
    expect(isRetrograde("mercury", new Date("2025-11-15T12:00:00Z"))).toBe(true);
    expect(isRetrograde("mercury", new Date("2025-10-01T12:00:00Z"))).toBe(false);
  });

  it("набор фактов не пуст и каждый валиден", () => {
    const facts = gatherThreadsFacts(AT);
    expect(facts.length).toBeGreaterThanOrEqual(4);
    for (const fact of facts) expect(threadsFactSchema.safeParse(fact).success).toBe(true);
  });
});

describe("кому нужен факт", () => {
  it("пост про знаки, Луну и Таро — да; про бывших и работу — нет", () => {
    expect(needsThreadsFact({ cluster: "знаки зодиака", scene: null })).toBe(true);
    expect(needsThreadsFact({ cluster: "таро", scene: null })).toBe(true);
    expect(needsThreadsFact({ cluster: "бывшие", scene: "Скорпион написал в 2 ночи" })).toBe(true);
    expect(needsThreadsFact({ cluster: "бывшие", scene: "Бывший лайкнул фото" })).toBe(false);
    expect(pickThreadsFact({ at: AT, cluster: "работа", scene: "Начальница в 18:55", seed: "a" })).toBeNull();
  });

  it("Таро-тема получает карту, астро-тема — небо", () => {
    expect(pickThreadsFact({ at: AT, cluster: "таро", scene: null, seed: "a" })?.mechanic).toBe("tarot_card");
    expect(pickThreadsFact({ at: AT, cluster: "знаки зодиака", scene: null, seed: "a" })?.mechanic).not.toBe("tarot_card");
  });

  it("соседние слоты (разные seed) не обязаны получать одну механику", () => {
    const kinds = new Set(["a", "b", "c", "d", "e", "f"].map((seed) => pickThreadsFact({ at: AT, cluster: "знаки", scene: null, seed })?.mechanic));
    expect(kinds.size).toBeGreaterThan(1);
  });
});

describe("проверка поста против факта", () => {
  const fact = moonSignFact(AT);
  const wrong = fact.subject.sign === "scorpio" ? "Тельце" : "Скорпионе";

  it("верный знак Луны проходит; чужой — замечание", () => {
    const right = fact.statement.split(" до ")[0];
    expect(factFindings(fact, `${right}. Все пишут бывшим.`)).toEqual([]);
    expect(factFindings(fact, `Луна в ${wrong}, держитесь.`).map((f) => f.rule)).toContain("fact-contradiction");
  });

  it("выдуманные ретроград, полнолуние и Солнце сверх факта ловятся; обращение к знаку — нет", () => {
    expect(factFindings(fact, "Меркурий ретроградный, не пиши ему").map((f) => f.rule)).toContain("fact-retrograde");
    expect(factFindings(fact, "Сегодня полнолуние, и это видно").map((f) => f.rule)).toContain("fact-phase");
    expect(factFindings(fact, "Солнце в Весах, и всем плохо").map((f) => f.rule)).toContain("fact-extra-sky");
    expect(factFindings(fact, "Тельцы, это про вас")).toEqual([]);
  });

  it("без факта проверки нет; автору факт уходит как данность с правилом", () => {
    expect(factFindings(null, "Луна в Овне и ретроград")).toEqual([]);
    const forWriter = factForWriter(fact);
    expect(forWriter?.statement).toBe(fact.statement);
    expect(forWriter?.rule).toMatch(/неизменяем/);
    expect(factForWriter(null)).toBeNull();
  });
});
