/**
 * B719 — потолок вывода, названный вызывающим, сильнее потолка из политики.
 *
 * ⚠ ЭТО НЕ УЛУЧШЕНИЕ, А ЗАКРЫТИЕ ДЕФЕКТА, ИЗ-ЗА КОТОРОГО ПРАВКА B718 НЕ
 * РАБОТАЛА. B718 подняла стартовый бюджет вывода обеих ролей SMM-агента до
 * 16 000 токенов и объяснила почему: `maxTokens` — это потолок, а не резерв,
 * и лестница 8000 → 14000 → 16000 стоила трёх полных вызовов вместо одного.
 * Рассуждение верное. Но значение не доезжало до провайдера: в `aiComplete`
 * стояло `attempt.maxTokens ?? maxTokens`, и потолок из `task-policy.ts`
 * (1 200 у редактора, 1 500 у автора) побеждал ВСЕГДА.
 *
 * Доказательство — боевые данные, а не рассуждение. `ai_attempts` прода за
 * 3 суток, только успешные попытки роли редактора:
 *
 *   NVIDIA   nemotron-3.5-lightning-30b   68 попыток, min = max = 1 200
 *   KILOCODE nemotron-3.5-lightning:free  56 попыток, min = max = 1 200
 *
 * Ровно 1 200 токенов 56 раз подряд — это не поведение модели, это срез по
 * потолку. Дальше срабатывал разбор обрыва: агент поднимал СВОЙ бюджет,
 * который сюда не доезжал, немедленно упирался в `nextBudget <= budget` и
 * уводил материал к следующему провайдеру. Один вердикт обходил так весь пул,
 * оплачивая полным промтом каждый шаг.
 */

import { resolveAIRoutingPlan } from "@/lib/ai-gateway/routing";
import { resolveAttemptCeiling } from "@/lib/ai";
import { AIProvider } from "@prisma/client";

const providerConfigs = [{
  provider: AIProvider.MISTRAL,
  enabled: true,
  priority: 10,
  defaultModel: "mistral-small-2603",
  timeoutMs: 30_000,
  inputTokenCostMicros: null,
  outputTokenCostMicros: null,
}];

describe("B719 — чей потолок вывода доезжает до провайдера", () => {
  const plan = () => resolveAIRoutingPlan({
    feature: "marketing-agent-reviewer",
    providerConfigs,
    policy: {
      feature: "marketing-agent-reviewer",
      enabled: true,
      providerOrder: [AIProvider.MISTRAL],
      maxTokens: 1200,
    },
    restrictToProviderOrder: true,
  });

  it("политика по-прежнему назначает потолок тем, кто своего не назвал", () => {
    expect(plan().attempts[0]?.maxTokens).toBe(1200);
  });

  it("но явный потолок вызывающего его перекрывает", () => {
    // Ровно то решение, которое принимает `aiComplete`: раньше здесь
    // оставалось 1 200, и бюджет SMM-агента не действовал вовсе.
    const fromPolicy = plan().attempts[0]?.maxTokens;
    expect(fromPolicy).toBe(1200);
    expect(resolveAttemptCeiling({ requested: 16_000, fromPolicy, fallback: 2000 }))
      .toBe(16_000);
  });

  it("не назвавший потолка получает политику, а без политики — умолчание", () => {
    expect(resolveAttemptCeiling({ fromPolicy: 1200, fallback: 2000 })).toBe(1200);
    expect(resolveAttemptCeiling({ fallback: 2000 })).toBe(2000);
  });

  it("потолок политики ниже видимого вывода думающей модели — значит обрыв неизбежен", () => {
    // Замер живой пробы боевым ключом 2026-08-23: у Ternary-Bonsai на один
    // вердикт ушло 2 323 токена вывода, из них 2 175 — `reasoning_tokens`.
    // При потолке 1 200 такой ответ не мог дописаться НИ РАЗУ.
    const observedReviewerOutput = 2_323;
    expect(plan().attempts[0]!.maxTokens!).toBeLessThan(observedReviewerOutput);
  });
});
