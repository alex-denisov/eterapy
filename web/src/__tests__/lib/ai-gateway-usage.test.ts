import {
  AIBudgetExceededError,
  enforceAIBudget,
  estimateAICostMicros,
  getAIUsageLedger,
  recordAIUsageLedger,
} from "@/lib/ai-gateway/usage";

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
});
