import {
  AIBudgetExceededError,
  enforceAIBudget,
  estimateAICostMicros,
  getAIUsageDetailsForRange,
  getAIUsageLedger,
  resolveAIModelCostRate,
  recordAIUsageLedger,
} from "@/lib/ai-gateway/usage";
import { AIProvider } from "@prisma/client";

describe("AI Gateway usage budgets", () => {
  it("estimates cost from per-1k token micro rates", () => {
    expect(estimateAICostMicros({
      promptTokens: 1500,
      completionTokens: 500,
    }, {
      inputTokenCostMicros: 100,
      outputTokenCostMicros: 300,
    })).toBe(300);
  });

  it("enforces feature and user daily token budgets", () => {
    expect(() => enforceAIBudget({
      requestedTokens: 200,
      policy: { dailyTokenBudget: 1000, perUserDailyTokenBudget: 500 },
      snapshot: { featureTokensToday: 700, userTokensToday: 200 },
    })).not.toThrow();

    expect(() => enforceAIBudget({
      requestedTokens: 400,
      policy: { dailyTokenBudget: 1000 },
      snapshot: { featureTokensToday: 700 },
    })).toThrow(expect.objectContaining({
      code: "AI_BUDGET_EXCEEDED",
      scope: "feature",
    } satisfies Partial<AIBudgetExceededError>));

    expect(() => enforceAIBudget({
      requestedTokens: 400,
      policy: { perUserDailyTokenBudget: 500 },
      snapshot: { userTokensToday: 200 },
    })).toThrow(expect.objectContaining({
      code: "AI_BUDGET_EXCEEDED",
      scope: "user",
    } satisfies Partial<AIBudgetExceededError>));
  });

  it("records global, feature, user, and plan ledger scopes", async () => {
    const client = {
      $executeRaw: jest.fn().mockResolvedValue(1),
    };

    await recordAIUsageLedger({
      feature: " Dialogue / Primary Answer ",
      userId: "user-1",
      planKey: "plus",
      period: "2026-04-28",
      tokens: 42,
      costMicros: 123,
    }, client as never);

    expect(client.$executeRaw).toHaveBeenCalledTimes(4);
  });

  it("normalizes usage rows returned from SQL", async () => {
    const client = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          scope_type: "feature",
          scope_key: "dialogue-primary-answer",
          period: "2026-04-28",
          tokens: BigInt(10),
          cost_micros: "20",
          request_count: 2,
        },
      ]),
    };

    await expect(getAIUsageLedger("2026-04-28", client as never)).resolves.toEqual([
      {
        scopeType: "feature",
        scopeKey: "dialogue-primary-answer",
        period: "2026-04-28",
        tokens: 10,
        costMicros: 20,
        requestCount: 2,
      },
    ]);
  });

  it("falls back to reference model pricing when database pricing is absent", async () => {
    const client = {
      aIProviderModel: {
        findUnique: jest.fn().mockResolvedValue({
          inputTokenCostMicros: null,
          outputTokenCostMicros: null,
        }),
      },
    };

    await expect(resolveAIModelCostRate({
      provider: AIProvider.YANDEX,
      model: "yandexgpt-lite/latest",
    }, client as never)).resolves.toEqual({
      inputTokenCostMicros: expect.any(Number),
      outputTokenCostMicros: expect.any(Number),
    });
  });

  it("recalculates historical zero-cost usage rows from reference model pricing", async () => {
    const client = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          feature: "dialogue-primary-answer",
          provider: "YANDEX",
          model: "yandexgpt-lite/latest",
          status: "SUCCEEDED",
          request_count: 1,
          attempt_count: 1,
          success_count: 1,
          prompt_tokens: 1200,
          completion_tokens: 800,
          total_tokens: 2000,
          cost_micros: 0,
          avg_latency_ms: 1100,
        },
      ]),
      aIProviderModel: {
        findUnique: jest.fn().mockResolvedValue({
          inputTokenCostMicros: null,
          outputTokenCostMicros: null,
        }),
      },
    };

    const rows = await getAIUsageDetailsForRange({
      start: new Date("2026-07-01T00:00:00.000Z"),
      end: new Date("2026-07-01T23:59:59.999Z"),
    }, client as never);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(expect.objectContaining({
      feature: "dialogue-primary-answer",
      totalTokens: 2000,
    }));
    expect(rows[0].costMicros).toBeGreaterThan(0);
  });
});
