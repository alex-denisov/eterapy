/**
 * B694 — остывающий ключ выглядел отсутствующим провайдером.
 *
 * Замер прода 2026-08-06, `ai_attempts` за сутки:
 *
 *   MISTRAL     396 успехов
 *   OPENROUTER   27 успехов, 320 пропусков MISSING_ADAPTER
 *   GEMINI       57 успехов, 274 пропуска  MISSING_ADAPTER
 *   GROQ         20 успехов, 265 пропусков MISSING_ADAPTER
 *   CEREBRAS      0 успехов, 130 пропусков MISSING_ADAPTER
 *   COHERE        1 успех,    45 пропусков MISSING_ADAPTER
 *
 * Больше тысячи пропусков «нет адаптера» — при том что ключи всех шести лежат в
 * базе и половина из них в тот же день успешно отвечала. Адаптер был на месте.
 *
 * Причина: ключ, получивший 429, уходит в остывание (`cooldownUntil`), и
 * выборка активных ключей становится пустой. Пустой список — единственный вход в
 * ветку `MISSING_ADAPTER`, поэтому «ключ остывает 4 минуты после квоты» и
 * «провайдер не настроен вовсе» выходили наружу одним кодом.
 *
 * Цена ошибки — не косметика. `MISSING_ADAPTER` не входит в ёмкостные коды
 * B692, поэтому проход, где ВСЕ провайдеры остывали, считался браком материала:
 * годный текст получал FAILED вместо следующего прохода. Это прямо нарушает
 * `feedback_pause_channel_not_cancel_material`.
 */

import {
  AIGatewayRoutingError,
  decideFailureFallback,
  runAIGatewayFallbackWithCredentials,
  type AIRoutingPlan,
} from "@/lib/ai-gateway/routing";
import { activeCredentialWhere } from "@/lib/ai-gateway/credentials";
import { isCapacityError, isDeferrableError } from "@/lib/marketing/agent";

const NOW = new Date("2026-08-06T14:00:00.000Z");

function plan(providers: string[]): AIRoutingPlan {
  return {
    feature: "marketing-agent-reviewer",
    attempts: providers.map((provider) => ({
      provider: provider as never,
      model: "test-model",
      timeoutMs: 1_000,
    })),
  };
}

function routingError(codes: string[]) {
  return new AIGatewayRoutingError(
    "All AI providers failed for marketing-agent-reviewer",
    "ALL_PROVIDERS_FAILED",
    codes.map((code) => ({
      provider: "GROQ" as never,
      status: "skipped" as const,
      code,
      retryable: true,
    })),
  );
}

describe("B694 — пустой список ключей разбирается на два разных случая", () => {
  it("ключи есть, но все остывают — код PROVIDER_COOLDOWN, а не MISSING_ADAPTER", async () => {
    const returnsAt = new Date(NOW.getTime() + 4 * 60_000);

    await expect(runAIGatewayFallbackWithCredentials({
      plan: plan(["GROQ", "COHERE"]),
      request: { messages: [{ role: "user", content: "ping" }] },
      resolveAdapters: async () => [],
      resolveCooldown: async () => returnsAt,
    })).rejects.toThrow(AIGatewayRoutingError);

    const error = await runAIGatewayFallbackWithCredentials({
      plan: plan(["GROQ", "COHERE"]),
      request: { messages: [{ role: "user", content: "ping" }] },
      resolveAdapters: async () => [],
      resolveCooldown: async () => returnsAt,
    }).catch((err: unknown) => err as AIGatewayRoutingError);

    expect(error.attempts?.map((attempt) => attempt.code)).toEqual([
      "PROVIDER_COOLDOWN",
      "PROVIDER_COOLDOWN",
    ]);
    // Время возврата ёмкости — единственное, что здесь можно сделать: ждать.
    // Без него владелец не знает, ждать минуту или час.
    expect((error.attempts?.[0] as { cooldownUntil?: Date })?.cooldownUntil).toEqual(returnsAt);
  });

  it("ключей нет вовсе — MISSING_ADAPTER остаётся честной жалобой на настройку", async () => {
    const error = await runAIGatewayFallbackWithCredentials({
      plan: plan(["GROQ"]),
      request: { messages: [{ role: "user", content: "ping" }] },
      resolveAdapters: async () => [],
      resolveCooldown: async () => null,
    }).catch((err: unknown) => err as AIGatewayRoutingError);

    expect(error.attempts?.map((attempt) => attempt.code)).toEqual(["MISSING_ADAPTER"]);
  });

  it("без resolveCooldown поведение прежнее — старые вызовы не меняют смысла", async () => {
    const error = await runAIGatewayFallbackWithCredentials({
      plan: plan(["GROQ"]),
      request: { messages: [{ role: "user", content: "ping" }] },
      resolveAdapters: async () => [],
    }).catch((err: unknown) => err as AIGatewayRoutingError);

    expect(error.attempts?.map((attempt) => attempt.code)).toEqual(["MISSING_ADAPTER"]);
  });

  it("остывание пропускает провайдера, а не останавливает перебор", () => {
    expect(decideFailureFallback("PROVIDER_COOLDOWN")).toBe("skipProvider");
  });
});

describe("B694 — остывание всего пула откладывает материал, а не бракует его", () => {
  it("проход, где все провайдеры остывали, считается ёмкостным", () => {
    const error = routingError(["PROVIDER_COOLDOWN", "PROVIDER_COOLDOWN"]);
    expect(isCapacityError(error)).toBe(true);
    expect(isDeferrableError(error)).toBe(true);
  });

  it("остывание вперемешку с квотой — тоже ёмкость", () => {
    expect(isCapacityError(routingError(["PROVIDER_COOLDOWN", "HTTP_429"]))).toBe(true);
  });

  it("граница держится: посторонний код рядом с остыванием ёмкостью не считается", () => {
    // Иначе брак материала будет вечно ждать «следующего прохода».
    expect(isCapacityError(routingError(["PROVIDER_COOLDOWN", "MISSING_ADAPTER"]))).toBe(false);
    expect(isCapacityError(routingError(["PROVIDER_COOLDOWN", "HTTP_400"]))).toBe(false);
  });
});

describe("B694 — региональная блокировка перестаёт быть дверью без обратного хода", () => {
  it("ключ без блокировки и без остывания берётся", () => {
    const where = activeCredentialWhere("GROQ" as never, NOW);
    expect(where.OR).toContainEqual({ regionBlocked: false, cooldownUntil: null });
  });

  it("заблокированный по региону ключ возвращается на пробу после срока", () => {
    // Cerebras на проде имеет region_blocked=t с пустым cooldownUntil: флаг
    // поставили один раз по HTTP 403, снять его было нечем, и провайдер выбыл
    // из пула навсегда (130 пропусков за сутки). Строка без срока — наследство,
    // и она обязана попасть в пробу, иначе правка не починит уже сломанное.
    const where = activeCredentialWhere("CEREBRAS" as never, NOW);
    const blockedBranches = where.OR.filter((branch) => branch.regionBlocked === true);
    expect(blockedBranches).toContainEqual({ regionBlocked: true, cooldownUntil: null });
    expect(blockedBranches).toContainEqual({ regionBlocked: true, cooldownUntil: { lt: NOW } });
  });

  it("свежая блокировка по региону в пул не попадает", () => {
    const where = activeCredentialWhere("CEREBRAS" as never, NOW);
    // Ни одна ветка не допускает `regionBlocked: true` с будущим сроком.
    expect(where.OR).not.toContainEqual({ regionBlocked: true, cooldownUntil: { gt: NOW } });
    expect(where.provider).toBe("CEREBRAS");
    expect(where.enabled).toBe(true);
  });
});
