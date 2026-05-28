import { randomUUID } from "crypto";
import { AIProvider, Prisma } from "@prisma/client";
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

export interface AIUsageDetailRow {
  feature: string;
  provider: string;
  model: string;
  status: string;
  requestCount: number;
  attemptCount: number;
  successCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costMicros: number;
  avgLatencyMs: number | null;
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

export async function resolveAIModelCostRate(input: {
  provider: AIProvider;
  model: string;
  fallback?: AICostRate | null;
}, client = db): Promise<AICostRate> {
  const row = await client.aIProviderModel.findUnique({
    where: { provider_modelId: { provider: input.provider, modelId: input.model } },
    select: { inputTokenCostMicros: true, outputTokenCostMicros: true },
  }).catch(() => null);

  return {
    inputTokenCostMicros: row?.inputTokenCostMicros ?? input.fallback?.inputTokenCostMicros ?? null,
    outputTokenCostMicros: row?.outputTokenCostMicros ?? input.fallback?.outputTokenCostMicros ?? null,
  };
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

function periodBounds(period: string) {
  const safe = /^\d{4}-\d{2}-\d{2}$/.test(period) ? period : aiBudgetPeriod();
  const start = new Date(`${safe}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

export async function getAIUsageDetails(period = aiBudgetPeriod(), client = db): Promise<AIUsageDetailRow[]> {
  const { start, end } = periodBounds(period);
  const rows = await client.$queryRaw<Array<{
    feature: string;
    provider: string;
    model: string;
    status: string;
    request_count: unknown;
    attempt_count: unknown;
    success_count: unknown;
    prompt_tokens: unknown;
    completion_tokens: unknown;
    total_tokens: unknown;
    cost_micros: unknown;
    avg_latency_ms: unknown;
  }>>(Prisma.sql`
    SELECT
      r.feature,
      COALESCE(a.provider::text, 'NO_ATTEMPT') AS provider,
      COALESCE(a.model, 'unknown') AS model,
      COALESCE(a.status::text, r.status::text) AS status,
      COUNT(DISTINCT r.id) AS request_count,
      COUNT(a.id) AS attempt_count,
      COUNT(*) FILTER (WHERE a.status::text = 'SUCCEEDED' OR (a.id IS NULL AND r.status::text = 'SUCCEEDED')) AS success_count,
      SUM(CASE WHEN a.id IS NULL THEN r.prompt_tokens ELSE a.prompt_tokens END) AS prompt_tokens,
      SUM(CASE WHEN a.id IS NULL THEN r.completion_tokens ELSE a.completion_tokens END) AS completion_tokens,
      SUM(CASE WHEN a.id IS NULL THEN r.total_tokens ELSE a.total_tokens END) AS total_tokens,
      SUM(CASE WHEN a.id IS NULL THEN r.estimated_cost_micros ELSE a.estimated_cost_micros END) AS cost_micros,
      AVG(a.latency_ms) AS avg_latency_ms
    FROM ai_requests r
    LEFT JOIN ai_attempts a ON a.ai_request_id = r.id
    WHERE r.created_at >= ${start} AND r.created_at < ${end}
    GROUP BY
      r.feature,
      COALESCE(a.provider::text, 'NO_ATTEMPT'),
      COALESCE(a.model, 'unknown'),
      COALESCE(a.status::text, r.status::text)
    ORDER BY cost_micros DESC, total_tokens DESC, request_count DESC
  `);

  return rows.map((row) => ({
    feature: row.feature,
    provider: row.provider,
    model: row.model,
    status: row.status,
    requestCount: numberFromDb(row.request_count),
    attemptCount: numberFromDb(row.attempt_count),
    successCount: numberFromDb(row.success_count),
    promptTokens: numberFromDb(row.prompt_tokens),
    completionTokens: numberFromDb(row.completion_tokens),
    totalTokens: numberFromDb(row.total_tokens),
    costMicros: numberFromDb(row.cost_micros),
    avgLatencyMs: row.avg_latency_ms === null ? null : Math.round(numberFromDb(row.avg_latency_ms)),
  }));
}
