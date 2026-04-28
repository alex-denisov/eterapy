import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import db from "@/lib/db";
import { aiBudgetPeriod, normalizeAIFeatureKey } from "@/lib/ai-gateway/domain";

export interface AICostRate {
  inputTokenCostMicros?: number | null;
  outputTokenCostMicros?: number | null;
}

export interface AIUsageAmount {
  promptTokens: number;
  completionTokens: number;
}

export interface AIBudgetSnapshot {
  featureTokensToday?: number;
  userTokensToday?: number;
}

export interface AIBudgetPolicy {
  dailyTokenBudget?: number | null;
  perUserDailyTokenBudget?: number | null;
}

export interface AIUsageLedgerRow {
  scopeType: string;
  scopeKey: string;
  period: string;
  tokens: number;
  costMicros: number;
  requestCount: number;
}

export class AIBudgetExceededError extends Error {
  code = "AI_BUDGET_EXCEEDED";
  scope: "feature" | "user";

  constructor(scope: "feature" | "user", message: string) {
    super(message);
    this.name = "AIBudgetExceededError";
    this.scope = scope;
  }
}

export function estimateAICostMicros(usage: AIUsageAmount, rate: AICostRate = {}) {
  const inputRate = rate.inputTokenCostMicros ?? 0;
  const outputRate = rate.outputTokenCostMicros ?? 0;
  return Math.ceil(((usage.promptTokens * inputRate) + (usage.completionTokens * outputRate)) / 1000);
}

export function enforceAIBudget(input: {
  requestedTokens: number;
  policy?: AIBudgetPolicy | null;
  snapshot?: AIBudgetSnapshot | null;
}) {
  const policy = input.policy;
  const snapshot = input.snapshot;
  const featureBudget = policy?.dailyTokenBudget;
  const userBudget = policy?.perUserDailyTokenBudget;

  if (featureBudget && (snapshot?.featureTokensToday ?? 0) + input.requestedTokens > featureBudget) {
    throw new AIBudgetExceededError("feature", "AI feature daily token budget exceeded");
  }

  if (userBudget && (snapshot?.userTokensToday ?? 0) + input.requestedTokens > userBudget) {
    throw new AIBudgetExceededError("user", "AI user daily token budget exceeded");
  }
}

export async function recordAIUsageLedger(input: {
  feature: string;
  userId?: string | null;
  planKey?: string | null;
  period?: string;
  tokens: number;
  costMicros: number;
  requestCount?: number;
}, client = db) {
  const period = input.period ?? aiBudgetPeriod();
  const feature = normalizeAIFeatureKey(input.feature);
  const scopes = [
    ["global", "all"],
    ["feature", feature],
    ...(input.userId ? [["user", input.userId]] : []),
    ...(input.planKey ? [["plan", input.planKey]] : []),
  ] as const;

  await Promise.all(scopes.map(([scopeType, scopeKey]) => client.$executeRaw(Prisma.sql`
    INSERT INTO ai_budget_ledger (id, scope_type, scope_key, period, tokens, cost_micros, request_count, created_at, updated_at)
    VALUES (${randomUUID()}, ${scopeType}, ${scopeKey}, ${period}, ${input.tokens}, ${input.costMicros}, ${input.requestCount ?? 1}, NOW(), NOW())
    ON CONFLICT (scope_type, scope_key, period)
    DO UPDATE SET
      tokens = ai_budget_ledger.tokens + EXCLUDED.tokens,
      cost_micros = ai_budget_ledger.cost_micros + EXCLUDED.cost_micros,
      request_count = ai_budget_ledger.request_count + EXCLUDED.request_count,
      updated_at = NOW()
  `)));
}

function numberFromDb(value: unknown) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

export async function getAIUsageLedger(period = aiBudgetPeriod(), client = db): Promise<AIUsageLedgerRow[]> {
  const rows = await client.$queryRaw<Array<{
    scope_type: string;
    scope_key: string;
    period: string;
    tokens: unknown;
    cost_micros: unknown;
    request_count: unknown;
  }>>(Prisma.sql`
    SELECT scope_type, scope_key, period, tokens, cost_micros, request_count
    FROM ai_budget_ledger
    WHERE period = ${period}
    ORDER BY scope_type ASC, tokens DESC, scope_key ASC
  `);

  return rows.map((row) => ({
    scopeType: row.scope_type,
    scopeKey: row.scope_key,
    period: row.period,
    tokens: numberFromDb(row.tokens),
    costMicros: numberFromDb(row.cost_micros),
    requestCount: numberFromDb(row.request_count),
  }));
}
