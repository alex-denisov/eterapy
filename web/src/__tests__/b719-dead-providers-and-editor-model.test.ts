/**
 * B719 — гигиена пула и цена вердикта редактора.
 *
 * Два решения владельца от 2026-08-23: «убери мёртвых провайдеров из активного
 * пула» и «модель редактора смени на более оптимальную».
 *
 * ⚠ ЧТО ЗДЕСЬ СТОРОЖИТСЯ, А ЧТО НЕТ. Прогон не может доказать, что провайдер
 * мёртв, — это доказал замер прода (`ai_attempts`, 7 суток: TOKENROUTER 0/61
 * все HTTP_503, COHERE 0/27 все HTTP_429, CEREBRAS 0/7 все HTTP_402, и ни
 * одного успеха за всю сохранённую историю с 2026-05-08). Прогон сторожит
 * СЛЕДСТВИЕ: чтобы решение нельзя было отменить молча — ни возвратом строки в
 * активный список, ни тем, что бюджет обращений материала снова начнёт
 * считать мёртвых.
 */

import { AIProvider } from "@prisma/client";
import {
  MARKETING_ACTIVE_PROVIDERS,
  MARKETING_FREE_PROVIDERS,
  MARKETING_RETIRED_PROVIDERS,
  MARKETING_REVIEWER_PRIORITY_HEAD,
  MARKETING_REVIEWER_MODEL_PREFERENCES,
  MARKETING_WRITER_MODEL_PREFERENCES,
  marketingProviderOrder,
  marketingReasoningSuppression,
  marketingModelFreshnessApplies,
} from "@/lib/marketing/model-pool";
import { maxStructuredAttemptsPerMaterial } from "@/lib/marketing/agent";

describe("B719 — мёртвые провайдеры выведены из активного пула", () => {
  it.each(MARKETING_RETIRED_PROVIDERS)("%s не участвует в обходе", (provider) => {
    expect(MARKETING_ACTIVE_PROVIDERS as readonly AIProvider[]).not.toContain(provider);
    expect(marketingProviderOrder("pub-1")).not.toContain(provider);
    expect(marketingProviderOrder("pub-2", [], [], { paidFallback: true })).not.toContain(provider);
  });

  it("но остаётся в периметре трансграничного гейта и в суперадминке", () => {
    // Список свободных провайдеров — это ещё и то, по чему пускает
    // `cross-border-gate`. Убрать оттуда значило бы получить отказ ПОЛИТИКИ
    // вместо отказа модели, если провайдер когда-нибудь оживёт.
    for (const provider of MARKETING_RETIRED_PROVIDERS) {
      expect(MARKETING_FREE_PROVIDERS as readonly AIProvider[]).toContain(provider);
    }
  });

  it("бюджет обращений материала больше не оплачивает мёртвых", () => {
    // Бюджет считается от размера пула: трое мёртвых раздували его на три
    // обращения, которые гарантированно уходили в никуда.
    expect(maxStructuredAttemptsPerMaterial()).toBe(
      maxStructuredAttemptsPerMaterial(MARKETING_ACTIVE_PROVIDERS.length),
    );
    expect(maxStructuredAttemptsPerMaterial(MARKETING_ACTIVE_PROVIDERS.length))
      .toBeLessThan(maxStructuredAttemptsPerMaterial(
        MARKETING_ACTIVE_PROVIDERS.length + MARKETING_RETIRED_PROVIDERS.length,
      ));
  });
});

describe("B740 — голова редактора передана Gemini, Mistral остался вторым", () => {
  /**
   * ⚠ ЭТОТ ПРОГОН ЗАМЕНИЛ ПРОВЕРКУ B719, И ЭТО НЕ ОСЛАБЛЕНИЕ КОНТРАКТА.
   *
   * B719 требовал, чтобы голова редактора ОТЛИЧАЛАСЬ от головы автора: замер
   * показывал у Mistral вывод в 18 раз короче и время в 26 раз меньше, чем у
   * думающих моделей пула. Владелец 2026-09-12 назвал другое предпочтение —
   * «поставь этого провайдера на место писателя и редактора».
   *
   * Что проверяется теперь: предпочтение владельца соблюдается на КАЖДОМ
   * материале (голова не вращается), Mistral стоит сразу за ним и ловит отказы
   * Gemini по квоте, а роли по-прежнему разделены МОДЕЛЬЮ — иначе независимая
   * проверка проверяла бы саму себя.
   */
  it("голова редактора — Gemini, как и у автора", () => {
    expect(MARKETING_REVIEWER_PRIORITY_HEAD).toEqual([AIProvider.GEMINI, AIProvider.MISTRAL]);
    expect(marketingProviderOrder("pub-1", [], [], { role: "reviewer" })[0])
      .toBe(AIProvider.GEMINI);
    expect(marketingProviderOrder("pub-1", [], [], { role: "writer" })[0])
      .toBe(AIProvider.GEMINI);
  });

  it("Mistral стоит сразу за головой: отказ Gemini по квоте не уводит вердикт к думающим моделям", () => {
    expect(marketingProviderOrder("pub-1", [], [], { role: "reviewer" })[1])
      .toBe(AIProvider.MISTRAL);
  });

  it("у Gemini автор и редактор смотрят в разные модели", () => {
    expect(MARKETING_WRITER_MODEL_PREFERENCES[AIProvider.GEMINI])
      .not.toBe(MARKETING_REVIEWER_MODEL_PREFERENCES[AIProvider.GEMINI]);
  });

  it("голова редактора постоянна между материалами, как и у автора", () => {
    for (const seed of ["a", "b", "c", "d", "e"]) {
      expect(marketingProviderOrder(seed, [], [], { role: "reviewer" })[0])
        .toBe(AIProvider.GEMINI);
    }
  });

  it("это предпочтение, а не запрет: без Gemini и Mistral обход продолжается", () => {
    const available = [AIProvider.GROQ, AIProvider.NVIDIA, AIProvider.OPENROUTER];
    const order = marketingProviderOrder("pub-1", [], available, { role: "reviewer" });
    expect(order).not.toContain(AIProvider.MISTRAL);
    expect(order.length).toBe(3);
  });

  it("у автора и редактора Mistral смотрит в разные модели", () => {
    // Иначе провайдер стал бы одномодельным и не смог бы вести обе роли.
    expect(MARKETING_WRITER_MODEL_PREFERENCES[AIProvider.MISTRAL])
      .not.toBe(MARKETING_REVIEWER_MODEL_PREFERENCES[AIProvider.MISTRAL]);
    expect(MARKETING_REVIEWER_MODEL_PREFERENCES[AIProvider.MISTRAL]).toBe("mistral-small-2603");
  });
});

describe("B719 — размышление гасится только у редактора и только там, где есть выключатель", () => {
  it("автор не получает директиву никогда", () => {
    for (const provider of MARKETING_ACTIVE_PROVIDERS) {
      expect(marketingReasoningSuppression({ feature: "marketing-agent-writer", provider })).toBeNull();
    }
  });

  it("думающие семейства получают свой штатный выключатель", () => {
    expect(marketingReasoningSuppression({
      feature: "marketing-agent-reviewer", provider: AIProvider.NVIDIA,
    })).toBe("detailed thinking off");
    expect(marketingReasoningSuppression({
      feature: "marketing-agent-reviewer", provider: AIProvider.GROQ,
    })).toBe("/no_think");
  });

  it("провайдеру без известного выключателя не подставляется строка наугад", () => {
    expect(marketingReasoningSuppression({
      feature: "marketing-agent-reviewer", provider: AIProvider.MISTRAL,
    })).toBeNull();
  });
});

describe("B719 — рубеж свежести спрашивается только у бесплатного пула", () => {
  it("бесплатные модели по-прежнему обязаны быть свежими", () => {
    expect(marketingModelFreshnessApplies(AIProvider.GEMINI)).toBe(true);
    expect(marketingModelFreshnessApplies(AIProvider.OPENROUTER)).toBe(true);
  });

  it("платный маршрут ограничен деньгами, а не возрастом весов", () => {
    // `yandexgpt/latest` — скользящий псевдоним: даты выпуска у него нет и
    // быть не может, а выдуманная дата записала бы в допущенные обещание.
    expect(marketingModelFreshnessApplies(AIProvider.YANDEX)).toBe(false);
    expect(marketingModelFreshnessApplies(AIProvider.OPENAI)).toBe(false);
  });
});
