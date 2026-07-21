/**
 * B554 round 3 — контракт триаж-промта первичного разбора.
 *
 * Каждый тест здесь закрывает дефект, найденный ЖИВЫМ прогоном против
 * YandexGPT Pro (eval-харнесс, 10 сценариев), а не придуманный за столом.
 */
import {
  buildClarifierSystemPrompt,
  buildPrimaryAnswerSystemPrompt,
  detectClarifierRegister,
} from "@/lib/dialogue-clarifier-prompt";
import { isInterrogationQuestion, parseConversationalTurnResponse } from "@/lib/dialogue-clarifier";

describe("B554 регистр разговора", () => {
  it("узнаёт символический запрос", () => {
    expect(detectClarifierRegister("Скажите, он вернётся? Может, карты подскажут")).toBe("symbolic");
    expect(detectClarifierRegister("Мне кажется, на мне порча")).toBe("symbolic");
  });

  it("узнаёт запрос про решение", () => {
    expect(detectClarifierRegister("Выбираю между двумя городами")).toBe("decision");
    expect(detectClarifierRegister("Не могу решиться на смену работы")).toBe("decision");
  });

  // Эксперт-эзотерик: предлагать карты человеку, который описал выбор с
  // известными ему критериями, — уход от его задачи. Поэтому «может, карты
  // подскажут» внутри вопроса о выборе НЕ должно переключать регистр.
  it("решение важнее упоминания карт", () => {
    expect(detectClarifierRegister("Выбираю между двумя городами, может, карты подскажут?")).toBe("decision");
  });

  it("по умолчанию психологический регистр", () => {
    expect(detectClarifierRegister("Просыпаюсь в 4 утра с колотящимся сердцем")).toBe("psychological");
    expect(detectClarifierRegister("")).toBe("psychological");
    expect(detectClarifierRegister(null)).toBe("psychological");
  });
});

describe("B554 промт уточнения", () => {
  const base = { originalQuestion: "Хожу по кругу уже месяц", topic: "career", difficulty: "medium" };

  it("до минимума ходов готовность запрещена, после — требуется", () => {
    const early = buildClarifierSystemPrompt({ ...base, previousPairsCount: 0, canBeReady: false, retry: false });
    expect(early).toContain("Сигнал готовности сейчас запрещён");

    const late = buildClarifierSystemPrompt({ ...base, previousPairsCount: 2, canBeReady: true, retry: false });
    expect(late).toContain('{"d":true}');
    expect(late).toContain("ХОД 3 ИЗ МАКСИМУМ 4");
  });

  // Живой прогон: без явного примера готовности модель не вернула её НИ РАЗУ
  // за диалог и всегда упиралась в потолок ходов — это и есть «перегружает
  // вопросами». Пример завершённого разговора обязан быть в промте.
  it("показывает завершённый разговор с сигналом готовности", () => {
    const prompt = buildClarifierSystemPrompt({ ...base, previousPairsCount: 1, canBeReady: false, retry: false });
    expect(prompt).toContain('Ты: {"d":true}');
    expect(prompt).toContain("ПЕРЕСТАЁТ спрашивать");
  });

  it("требует цитату человека в отражении и запрещает лекции про всех", () => {
    const prompt = buildClarifierSystemPrompt({ ...base, previousPairsCount: 1, canBeReady: false, retry: false });
    expect(prompt).toContain("цитаты 1–3 слов");
    expect(prompt).toContain("Объяснять людей вообще");
  });

  it("подставляет разбор по регистру, а не один на всех", () => {
    const symbolic = buildClarifierSystemPrompt({
      ...base,
      originalQuestion: "Он вернётся? Что говорят карты",
      previousPairsCount: 0,
      canBeReady: false,
      retry: false,
    });
    expect(symbolic).toContain("КОНФИГУРАЦИЮ");
    expect(symbolic).not.toContain("Ему нужна структура, а не символы");
  });
});

describe("B554 промт разбора", () => {
  it("держит пять блоков и обе проверки на честность", () => {
    const prompt = buildPrimaryAnswerSystemPrompt({ topic: "career", difficulty: "medium" });
    expect(prompt).toContain("Если коротко");
    expect(prompt).toContain("Что осталось за кадром");
    expect(prompt).toContain("унесёт ли он отсюда что-то работающее");
    expect(prompt).toContain("не должна быть выше");
  });

  // Живой прогон на кризисном сценарии: модель написала «это просто мысль» и
  // выдала упражнение с бумагой. Обесценивание и домашняя работа в этом
  // состоянии читаются как отписка.
  it("в чувствительном режиме запрещает обесценивание, задания и выдуманные телефоны", () => {
    const prompt = buildPrimaryAnswerSystemPrompt({ safetyLevel: "sensitive" });
    expect(prompt).toContain("ЗАПРЕЩЕНО обесценивать");
    expect(prompt).toContain("ЗАПРЕЩЕНО давать упражнения");
    expect(prompt).toContain("телефоны");
  });
});

describe("B554 разбор ответа модели", () => {
  it("булев d означает готовность", () => {
    expect(parseConversationalTurnResponse('{"d":true}')).toEqual({ type: "ready", source: "ai" });
  });

  it("d:false отдаёт ход и хранит вопрос отдельно от отражения", () => {
    const parsed = parseConversationalTurnResponse(
      '{"d":false,"m":"«Хожу по кругу» — дело уже не в информации.","q":"Что тяжелее представить?","c":["Уйти","Остаться","Не знаю"]}',
    );
    expect(parsed?.type).toBe("question");
    expect(parsed?.question).toContain("Хожу по кругу");
    // Именно это поле чинит повтор вопроса под новым отражением.
    expect(parsed?.askedQuestion).toBe("Что тяжелее представить?");
    expect(parsed?.chips).toEqual(["Уйти", "Остаться", "Не знаю"]);
  });
});

describe("B554 запрет допроса", () => {
  // Эксперты рекомендуют «что останавливает в последний момент» как ЗАМЕНУ
  // для «почему вы не можете решиться». Различитель — местоимение «вас».
  it("личная форма — допрос, безличная с якорем — нет", () => {
    expect(isInterrogationQuestion("Что вас останавливает от этого разговора?")).toBe(true);
    expect(isInterrogationQuestion("Что останавливает вас?")).toBe(true);
    expect(isInterrogationQuestion("Что останавливает в последний момент?")).toBe(false);
  });
});
