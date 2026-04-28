import { AIProvider } from "@prisma/client";
import { classifyProviderError } from "@/lib/ai-gateway/adapters";
import {
  applyAttemptToCircuitState,
  filterRoutingPlanByCircuit,
  isProviderCircuitOpen,
  type AIProviderCircuitState,
} from "@/lib/ai-gateway/circuit-breaker";

describe("AI Gateway circuit breaker", () => {
  it("classifies aborted provider requests as retryable timeouts", () => {
    expect(classifyProviderError(Object.assign(new Error("aborted"), { name: "AbortError" }))).toEqual({
      code: "TIMEOUT",
      retryable: true,
    });
    expect(classifyProviderError(Object.assign(new Error("socket timed out"), { code: "ETIMEDOUT" }))).toEqual({
      code: "TIMEOUT",
      retryable: true,
    });
  });

  it("opens a provider circuit after threshold retryable failures", () => {
    const now = new Date("2026-04-28T01:00:00.000Z");
    let state: AIProviderCircuitState = {
      provider: AIProvider.OPENROUTER,
      failureCount: 0,
    };

    state = applyAttemptToCircuitState(state, {
      provider: AIProvider.OPENROUTER,
      status: "failed",
      code: "HTTP_429",
      retryable: true,
    }, now, { failureThreshold: 2, cooldownMs: 30_000 });
    expect(isProviderCircuitOpen(state, now)).toBe(false);

    state = applyAttemptToCircuitState(state, {
      provider: AIProvider.OPENROUTER,
      status: "failed",
      code: "HTTP_429",
      retryable: true,
    }, now, { failureThreshold: 2, cooldownMs: 30_000 });
    expect(state.failureCount).toBe(2);
    expect(state.lastFailureCode).toBe("HTTP_429");
    expect(state.openedUntil?.toISOString()).toBe("2026-04-28T01:00:30.000Z");
    expect(isProviderCircuitOpen(state, now)).toBe(true);
    expect(isProviderCircuitOpen(state, new Date("2026-04-28T01:00:31.000Z"))).toBe(false);
  });

  it("resets circuit state on success and ignores non-retryable failures", () => {
    const opened: AIProviderCircuitState = {
      provider: AIProvider.OPENAI,
      failureCount: 3,
      openedUntil: new Date("2026-04-28T01:05:00.000Z"),
      lastFailureCode: "HTTP_500",
    };

    expect(applyAttemptToCircuitState(opened, {
      provider: AIProvider.OPENAI,
      status: "failed",
      code: "HTTP_400",
      retryable: false,
    })).toBe(opened);

    expect(applyAttemptToCircuitState(opened, {
      provider: AIProvider.OPENAI,
      status: "succeeded",
    })).toEqual({
      provider: AIProvider.OPENAI,
      failureCount: 0,
      openedUntil: null,
      lastFailureCode: null,
    });
  });

  it("filters open providers out of a routing plan and records skipped attempts", () => {
    const result = filterRoutingPlanByCircuit({
      plan: {
        feature: "dialogue-primary-answer",
        attempts: [
          { provider: AIProvider.OPENROUTER, model: "openai/gpt-4o-mini", timeoutMs: 1000 },
          { provider: AIProvider.OPENAI, model: "gpt-4o-mini", timeoutMs: 1000 },
        ],
      },
      states: new Map([
        [AIProvider.OPENROUTER, {
          provider: AIProvider.OPENROUTER,
          failureCount: 3,
          openedUntil: new Date("2026-04-28T01:05:00.000Z"),
          lastFailureCode: "HTTP_500",
        }],
      ]),
      now: new Date("2026-04-28T01:00:00.000Z"),
    });

    expect(result.plan.attempts.map((attempt) => attempt.provider)).toEqual([AIProvider.OPENAI]);
    expect(result.skipped).toEqual([
      {
        provider: AIProvider.OPENROUTER,
        model: "openai/gpt-4o-mini",
        status: "skipped",
        code: "CIRCUIT_OPEN",
        retryable: true,
      },
    ]);
  });
});
