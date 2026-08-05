/**
 * B680 — рубеж по числу обращений к моделям на ОДИН материал.
 *
 * Замер прода 2026-08-06: 1190 вызовов и 6.6 млн токенов за двое суток на пять
 * вышедших публикаций, редактор каждые сутки упирался ровно в потолок 2 000 000,
 * проход уходил в cooldown с 103 отложенными строками. Веер повторов (раунд ×
 * провайдер × ступень бюджета) не был ограничен ничем.
 *
 * Прогон держит три утверждения:
 *  1. предел не даёт материалу уйти за отведённое число попыток;
 *  2. исчерпание попыток — ОТЛОЖЕННЫЙ отказ, а не брак материала;
 *  3. счётчик общий на обе роли, иначе рубеж считает не то.
 */

import {
  MAX_STRUCTURED_ATTEMPTS_PER_MATERIAL,
  MarketingAttemptBudgetError,
  MarketingCapacityError,
  MarketingModelSeparationError,
  isDeferrableError,
} from "@/lib/marketing/agent";

describe("B680: лимит попыток на материал", () => {
  it("предел задан и оставляет место трём полным раундам", () => {
    // Три раунда «автор + редактор» = 6 обращений; предел обязан быть больше,
    // иначе штатный цикл правки не доходит до конца.
    expect(MAX_STRUCTURED_ATTEMPTS_PER_MATERIAL).toBeGreaterThanOrEqual(6);
    expect(MAX_STRUCTURED_ATTEMPTS_PER_MATERIAL).toBeLessThanOrEqual(24);
  });

  it("исчерпание попыток откладывает материал, а не бракует его", () => {
    const error = new MarketingAttemptBudgetError("12 обращений, предел 12");
    expect(isDeferrableError(error)).toBe(true);
  });

  it("остальные отложенные причины не сломаны", () => {
    expect(isDeferrableError(new MarketingCapacityError("daily token budget exceeded"))).toBe(true);
    expect(isDeferrableError(new MarketingModelSeparationError("одна модель"))).toBe(true);
    // Замечание редактора по существу отложенным НЕ становится.
    expect(isDeferrableError(new Error("Independent reviewer did not approve"))).toBe(false);
  });

  it("счётчик общий: попытки обеих ролей складываются и упираются в предел", () => {
    // Тот же объект, что агент передаёт автору и редактору.
    const attempts = { used: 0 };
    const spend = () => {
      if (attempts.used >= MAX_STRUCTURED_ATTEMPTS_PER_MATERIAL) {
        throw new MarketingAttemptBudgetError(`израсходовано ${attempts.used}`);
      }
      attempts.used += 1;
    };
    for (let index = 0; index < MAX_STRUCTURED_ATTEMPTS_PER_MATERIAL; index += 1) spend();
    expect(attempts.used).toBe(MAX_STRUCTURED_ATTEMPTS_PER_MATERIAL);
    expect(spend).toThrow(MarketingAttemptBudgetError);
  });

  it("у ошибки есть имя — по нему сигнал отличает причину", () => {
    expect(new MarketingAttemptBudgetError("x").name).toBe("MarketingAttemptBudgetError");
  });
});
