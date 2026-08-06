/**
 * B687 — явный `providerOrder` стал ограничением, а не пожеланием.
 *
 * Замер прода 2026-08-06 (журнал `eterapy-marketing-agent-1`): конвейер стоял
 * трое суток — `deferred: 103, processed: 0, capacityCooldown: true` на каждом
 * тике. Открытый сигнал `agent:capacity` говорил «в пуле не осталось модели,
 * отличной от модели автора», и перечислял ВСЕ провайдеры с одним и тем же
 * ответом: `OPENROUTER: resolved to the writer's model mistral-small-2603;
 * GEMINI: … mistral-small-2603; CEREBRAS: … mistral-small-2603; GROQ: …
 * mistral-small-2603; COHERE: … mistral-small-2603`.
 *
 * Читалось это как «четыре провайдера разрешаются в одну модель» и три захода
 * подряд разбиралось как проблема пула моделей. Пул был ни при чём.
 *
 * Причина — в планировщике маршрута:
 *
 *     const orderedProviders = uniqueProviderOrder([...policyProviders, ...priorityProviders]);
 *
 * К заказанному списку БЕЗУСЛОВНО дописывались все остальные включённые
 * провайдеры. Редактор просил `providerOrder: [GROQ]`, получал план
 * `[GROQ, OPENROUTER, GEMINI, CEREBRAS, MISTRAL, COHERE]`, и цепочка отката
 * доходила до первого, кто ответит. Отвечал Mistral. Шесть «разных
 * провайдеров» редактора были шестью одинаковыми вызовами в Mistral, и
 * сравнение `response.model === excludeModel` честно ловило совпадение
 * каждый раз.
 *
 * Отсюда же расход из B680: один «перебор провайдеров» — это шесть полных
 * цепочек отката, а не шесть обращений.
 *
 * Граница: список, заказанный вызывающим, исполняется дословно. Список,
 * пришедший из политики в базе, по-прежнему достраивается — там дописывание
 * это отказоустойчивость, и её никто не просил снимать.
 */

import { AIProvider } from "@prisma/client";
import { resolveAIRoutingPlan } from "@/lib/ai-gateway/routing";

jest.mock("@/lib/env", () => ({
  isYandexOnlyLLMMode: () => false,
  getYandexPrimaryModel: () => "yandexgpt/latest",
  getYandexFallbackModels: () => [],
}));

const PROVIDER_CONFIGS = [
  { provider: AIProvider.OPENROUTER, enabled: true, priority: 1, defaultModel: "or-model" },
  { provider: AIProvider.GEMINI, enabled: true, priority: 2, defaultModel: "gemini-model" },
  { provider: AIProvider.GROQ, enabled: true, priority: 3, defaultModel: "groq-model" },
  { provider: AIProvider.MISTRAL, enabled: true, priority: 4, defaultModel: "mistral-model" },
];

describe("B687 · заказанный маршрут исполняется дословно", () => {
  it("один заказанный провайдер даёт РОВНО одну попытку", () => {
    const plan = resolveAIRoutingPlan({
      feature: "marketing-agent-reviewer",
      providerConfigs: PROVIDER_CONFIGS,
      policy: {
        feature: "marketing-agent-reviewer",
        enabled: true,
        providerOrder: [AIProvider.GROQ],
      },
      restrictToProviderOrder: true,
    });
    expect(plan.attempts.map((attempt) => attempt.provider)).toEqual([AIProvider.GROQ]);
  });

  it("без ограничения план всё ещё достраивается — отказоустойчивость не тронута", () => {
    const plan = resolveAIRoutingPlan({
      feature: "chat",
      providerConfigs: PROVIDER_CONFIGS,
      policy: {
        feature: "chat",
        enabled: true,
        providerOrder: [AIProvider.GROQ],
      },
    });
    expect(plan.attempts[0].provider).toBe(AIProvider.GROQ);
    expect(plan.attempts.length).toBeGreaterThan(1);
  });

  it("ограничение не выдумывает провайдеров, которых нет среди включённых", () => {
    const plan = resolveAIRoutingPlan({
      feature: "marketing-agent-writer",
      providerConfigs: PROVIDER_CONFIGS,
      policy: {
        feature: "marketing-agent-writer",
        enabled: true,
        providerOrder: [AIProvider.COHERE, AIProvider.GEMINI],
      },
      restrictToProviderOrder: true,
    });
    expect(plan.attempts.map((attempt) => attempt.provider)).toEqual([AIProvider.GEMINI]);
  });

  it("заказан только выключенный провайдер — это отказ маршрута, а не тихий уход к другому", () => {
    expect(() => resolveAIRoutingPlan({
      feature: "marketing-agent-reviewer",
      providerConfigs: [
        ...PROVIDER_CONFIGS,
        { provider: AIProvider.COHERE, enabled: false, priority: 9, defaultModel: "cohere-model" },
      ],
      policy: {
        feature: "marketing-agent-reviewer",
        enabled: true,
        providerOrder: [AIProvider.COHERE],
      },
      restrictToProviderOrder: true,
    })).toThrow(/No enabled AI providers/);
  });
});
