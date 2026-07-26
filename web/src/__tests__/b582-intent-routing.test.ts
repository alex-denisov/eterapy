/**
 * B582 (owner 2026-07-26) — первичный разбор отвечал эзотерическому запросу
 * как психолог.
 *
 * Живой случай, диалог `cms07v38r00370kwka6eiy6to` на проде. Вопрос человека:
 * «Буду ли я жить в этой стране». Ответ практика: «Ваш вопрос касается
 * будущего места жительства. Интересно, какие факторы влияют на ваше решение?»
 * Человек ушёл после первого хода.
 *
 * Две причины, и обе структурные.
 *
 * 1. Определитель регистра ловил эзотерические ИНСТРУМЕНТЫ (карты, таро,
 *    порча, судьба), а запрос на прогноз инструментов не называет. «Буду ли
 *    я…», «вернётся ли он», «что меня ждёт» — тот же контракт («скажите, что
 *    будет»), но без единого эзотерического слова. Весь класс проваливался
 *    в психологический регистр.
 *
 * 2. Подбор форматов вообще не знал про регистр — только про тему. Тема у
 *    «он меня не слышит» и «вернётся ли он» одна («отношения»), а нужные
 *    форматы разные. Поэтому даже верно опознанному эзотерическому запросу
 *    предлагались «Переосмысление» и «Разбор ситуации».
 *
 * Побочная находка: `horary` («Хорарная астрология» — прямой ответ по карте
 * момента на ОДИН вопрос) не рекомендовался ни одной воронкой, хотя это ровно
 * тот формат, который отвечает на вопрос вида «буду ли я…».
 */
import { detectClarifierRegister, buildPrimaryAnswerSystemPrompt } from "@/lib/dialogue-clarifier-prompt";
import {
  recommendPrimaryProduct,
  recommendSecondaryProducts,
} from "@/lib/product-format-recommendations";

describe("B582 — запрос на прогноз опознаётся как эзотерический", () => {
  it("ловит вопрос, на котором это вскрылось", () => {
    expect(detectClarifierRegister("Буду ли я жить в этой стране")).toBe("symbolic");
  });

  it.each([
    "Выйду ли я замуж",
    "Вернётся ли он ко мне",
    "Что меня ждёт в этом году",
    "Найду ли я работу",
    "Есть ли у нас будущее",
    "Когда я встречу своего человека",
    "Мне суждено быть одной?",
    "Дайте прогноз на осень",
  ])("ловит прогноз без единого эзотерического слова: %s", (question) => {
    expect(detectClarifierRegister(question)).toBe("symbolic");
  });

  it("не путает боль с гаданием", () => {
    // «Будет ли легче» — формально вопрос о будущем, но человек спрашивает
    // про свою боль. Символический регистр (циклы, расстановка сил) там
    // читается как уход от разговора.
    expect(detectClarifierRegister("Будет ли легче когда-нибудь")).toBe("psychological");
    expect(detectClarifierRegister("Станет ли лучше")).toBe("psychological");
  });

  it("оставляет структурный регистр тому, кто начал с выбора", () => {
    // Правило эксперта-эзотерика: не предлагать карты там, где у человека
    // есть свои критерии выбора.
    expect(detectClarifierRegister("Стоит ли мне переезжать")).toBe("decision");
    expect(detectClarifierRegister("Выбираю между двумя городами, может, карты подскажут?")).toBe("decision");
  });

  it("видит намерение, проступившее не в первой реплике", () => {
    expect(detectClarifierRegister("Тяжело на душе", ["а можете посмотреть по картам?"])).toBe("symbolic");
    expect(detectClarifierRegister("Тяжело на душе", ["не сплю уже неделю"])).toBe("psychological");
  });

  it("разворачивает промт разбора на язык человека", () => {
    const symbolic = buildPrimaryAnswerSystemPrompt({ originalQuestion: "Буду ли я жить в этой стране" });
    expect(symbolic).toContain("на языке символов");

    const psychological = buildPrimaryAnswerSystemPrompt({ originalQuestion: "Близкий человек молчит уже три дня" });
    expect(psychological).toContain("о состоянии и отношениях");
  });
});

describe("B582 — форматы после разбора соответствуют запросу", () => {
  it("эзотерическому запросу даёт эзотерический основной формат", () => {
    const primary = recommendPrimaryProduct("relationships", "symbolic");
    expect(primary.slug).toBe("horary");

    const psych = recommendPrimaryProduct("relationships", "psychological");
    expect(psych.slug).toBe("pair");
  });

  it("по умолчанию ведёт себя как раньше — регистр не обязателен", () => {
    expect(recommendPrimaryProduct("career").slug).toBe(recommendPrimaryProduct("career", "psychological").slug);
  });

  it("смешивает, но не подменяет: свой регистр первым, соседний последним", () => {
    const symbolic = recommendSecondaryProducts("relationships", "horary", 3, "symbolic");
    expect(symbolic).toHaveLength(3);
    // Первыми — форматы того же языка.
    expect(symbolic.slice(0, 2).map((p) => p.slug)).toEqual(["tarot", "synastry"]);
    // Замыкающий — мостик на соседнюю полку, чтобы человек её видел.
    expect(symbolic[2].slug).toBe("reframe");

    const psychological = recommendSecondaryProducts("relationships", "pair", 3, "psychological");
    expect(psychological[psychological.length - 1].slug).toBe("tarot");
    expect(psychological.map((p) => p.slug)).toContain("chat-analysis");
  });

  it("при единственном слоте отдаёт его своему регистру, а не мостику", () => {
    const [only] = recommendSecondaryProducts("self", "natal-chart", 1, "symbolic");
    expect(only.slug).toBe("human-design");
    expect(only.slug).not.toBe("reframe");
  });

  it("никогда не рекомендует формат, который человек только что прошёл", () => {
    const list = recommendSecondaryProducts("relationships", "tarot", 3, "symbolic");
    expect(list.map((p) => p.slug)).not.toContain("tarot");
    expect(list).toHaveLength(3);
  });

  it("отдаёт ровно столько форматов, сколько попросили", () => {
    // Мостик резервирует последнее место; без добора список приходил бы
    // короче на один пункт.
    for (const topic of ["relationships", "family", "career", "money", "anxiety", "self", "other"]) {
      for (const register of ["symbolic", "psychological"] as const) {
        const list = recommendSecondaryProducts(topic, "___none___", 3, register);
        expect(list).toHaveLength(3);
        expect(new Set(list.map((p) => p.slug)).size).toBe(3);
      }
    }
  });

  it("открывает вход в хорар — формат, который отвечает на «буду ли я…»", () => {
    // До B582 `horary` не появлялся ни в одной рекомендации вовсе.
    const primary = recommendPrimaryProduct("other", "symbolic");
    expect(primary.slug).toBe("horary");
    expect(primary.href).toBe("/products/horary");
  });
});
