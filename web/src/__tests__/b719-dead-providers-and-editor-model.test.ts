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

describe("B719 — редактор спрашивает самую немногословную модель первой", () => {
  it("голова редактора отличается от головы автора", () => {
    expect(MARKETING_REVIEWER_PRIORITY_HEAD).toEqual([AIProvider.MISTRAL]);
    expect(marketingProviderOrder("pub-1", [], [], { role: "reviewer" })[0])
      .toBe(AIProvider.MISTRAL);
    expect(marketingProviderOrder("pub-1", [], [], { role: "writer" })[0])
      .toBe(AIProvider.GEMINI);
  });

  it("голова редактора постоянна между материалами, как и у автора", () => {
    for (const seed of ["a", "b", "c", "d", "e"]) {
      expect(marketingProviderOrder(seed, [], [], { role: "reviewer" })[0])
        .toBe(AIProvider.MISTRAL);
    }
  });

  it("это предпочтение, а не запрет: без Mistral обход продолжается", () => {
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
