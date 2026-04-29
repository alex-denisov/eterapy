import { AIAttemptStatus, AIProvider, AIRequestStatus } from "@prisma/client";
import db from "@/lib/db";
import {
  type AIGatewayAdapter,
  AIProviderError,
} from "@/lib/ai-gateway/adapters";
import { createAnthropicAdapter } from "@/lib/ai-gateway/anthropic-adapter";
import { createFireworksAdapter } from "@/lib/ai-gateway/fireworks-adapter";
import { createOpenAIAdapter } from "@/lib/ai-gateway/openai-adapter";
import { createOpenRouterAdapter } from "@/lib/ai-gateway/openrouter-adapter";
import {
  normalizeAIFeatureKey,
  type AIGatewayMessage,
} from "@/lib/ai-gateway/domain";
import {
  AIGatewayRoutingError,
  resolveAIRoutingPlan,
  runAIGatewayFallbackWithCredentials,
  type AICredentialAdapter,
  type AIRoutingPolicyConfig,
  type AIRoutingProviderConfig,
} from "@/lib/ai-gateway/routing";
import {
  enforceAIBudget,
  estimateAICostMicros,
  recordAIUsageLedger,
} from "@/lib/ai-gateway/usage";
import {
  listActiveCredentialsForProvider,
  markCredentialFailure,
  markCredentialSuccess,
  type DecryptedAICredential,
} from "@/lib/ai-gateway/credentials";
import { log, serializeError } from "@/lib/logger";

const DEFAULT_PROVIDER_CONFIGS: AIRoutingProviderConfig[] = [
  { provider: AIProvider.OPENROUTER, enabled: true, priority: 10, defaultModel: "openrouter/free", timeoutMs: 30_000, inputTokenCostMicros: null, outputTokenCostMicros: null },
  { provider: AIProvider.OPENAI, enabled: true, priority: 20, defaultModel: "gpt-4o-mini", timeoutMs: 30_000, inputTokenCostMicros: null, outputTokenCostMicros: null },
  { provider: AIProvider.ANTHROPIC, enabled: true, priority: 30, defaultModel: "claude-3-5-haiku-20241022", timeoutMs: 30_000, inputTokenCostMicros: null, outputTokenCostMicros: null },
  { provider: AIProvider.FIREWORKS, enabled: true, priority: 40, defaultModel: "accounts/fireworks/models/llama-v3p1-8b-instruct", timeoutMs: 30_000, inputTokenCostMicros: null, outputTokenCostMicros: null },
];

function buildAdapterForCredential(credential: DecryptedAICredential): AIGatewayAdapter {
  const opts = {
    apiKey: credential.apiKey,
    ...(credential.baseUrlOverride ? { baseURL: credential.baseUrlOverride } : {}),
    ...(credential.modelOverride ? { defaultModel: credential.modelOverride } : {}),
  };
  switch (credential.provider) {
    case AIProvider.OPENROUTER:
      return createOpenRouterAdapter(opts);
    case AIProvider.OPENAI:
      return createOpenAIAdapter(opts);
    case AIProvider.ANTHROPIC:
      return createAnthropicAdapter(opts);
    case AIProvider.FIREWORKS:
      return createFireworksAdapter(opts);
  }
}

interface AIRequestOptions {
  messages: AIGatewayMessage[];
  maxTokens?: number;
  temperature?: number;
  requestId?: string;
  feature?: string;
  userId?: string | null;
}

interface AIResponse {
  text: string;
  model: string;
  provider: "openrouter" | "openai" | "anthropic" | "fireworks";
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
}

function adaptersForCredentials(credentials: DecryptedAICredential[]): AICredentialAdapter[] {
  return credentials.map((credential) => ({
    credentialId: credential.id,
    credentialLabel: credential.label,
    adapter: buildAdapterForCredential(credential),
  }));
}

interface FailureClassification {
  cooldownMs: number;
  regionBlocked: boolean;
}

function classifyCredentialFailure(code: string | undefined): FailureClassification {
  if (!code) return { cooldownMs: 60_000, regionBlocked: false };
  if (code === "HTTP_403") return { cooldownMs: 0, regionBlocked: true };
  if (code === "HTTP_401") return { cooldownMs: 30 * 60_000, regionBlocked: false };
  if (code === "HTTP_402") return { cooldownMs: 60 * 60_000, regionBlocked: false };
  if (code === "HTTP_429") return { cooldownMs: 5 * 60_000, regionBlocked: false };
  if (code === "TIMEOUT" || /^HTTP_5\d\d$/.test(code)) return { cooldownMs: 60_000, regionBlocked: false };
  if (code === "MISSING_CONFIG") return { cooldownMs: 0, regionBlocked: false };
  return { cooldownMs: 60_000, regionBlocked: false };
}

function providerLabel(provider: AIProvider): AIResponse["provider"] {
  if (provider === AIProvider.OPENROUTER) return "openrouter";
  if (provider === AIProvider.OPENAI) return "openai";
  if (provider === AIProvider.ANTHROPIC) return "anthropic";
  return "fireworks";
}

async function loadProviderConfigs(): Promise<AIRoutingProviderConfig[]> {
  const rows = await db.aIProviderConfig.findMany({ orderBy: [{ priority: "asc" }, { provider: "asc" }] });
  if (rows.length === 0) return DEFAULT_PROVIDER_CONFIGS;
  return rows.map((row) => ({
    provider: row.provider,
    enabled: row.enabled,
    priority: row.priority,
    defaultModel: row.defaultModel,
    timeoutMs: row.timeoutMs,
    inputTokenCostMicros: row.inputTokenCostMicros,
    outputTokenCostMicros: row.outputTokenCostMicros,
  }));
}

async function loadPolicy(feature: string): Promise<AIRoutingPolicyConfig | null> {
  const row = await db.aIRoutingPolicy.findUnique({ where: { feature } });
  if (!row) return null;
  return {
    feature: row.feature,
    enabled: row.enabled,
    providerOrder: row.providerOrder,
    modelPreferences: row.modelPreferences,
    maxTokens: row.maxTokens,
    temperature: row.temperature,
    timeoutMs: row.timeoutMs,
    dailyTokenBudget: row.dailyTokenBudget,
    perUserDailyTokenBudget: row.perUserDailyTokenBudget,
  };
}

async function budgetSnapshot(feature: string, userId?: string | null) {
  const [featureRow, userRow] = await Promise.all([
    db.aIBudgetLedger.findUnique({
      where: { scopeType_scopeKey_period: { scopeType: "feature", scopeKey: feature, period: new Date().toISOString().slice(0, 10) } },
    }),
    userId ? db.aIBudgetLedger.findUnique({
      where: { scopeType_scopeKey_period: { scopeType: "user", scopeKey: userId, period: new Date().toISOString().slice(0, 10) } },
    }) : null,
  ]);
  return {
    featureTokensToday: featureRow?.tokens ?? 0,
    userTokensToday: userRow?.tokens ?? 0,
  };
}

function attemptStatus(attempt: { status: "succeeded" | "failed" | "skipped"; code?: string }): AIAttemptStatus {
  if (attempt.status === "succeeded") return AIAttemptStatus.SUCCEEDED;
  if (attempt.status === "skipped") return AIAttemptStatus.SKIPPED;
  if (attempt.code === "TIMEOUT") return AIAttemptStatus.TIMEOUT;
  if (attempt.code === "HTTP_429") return AIAttemptStatus.RATE_LIMITED;
  return AIAttemptStatus.FAILED;
}

export async function aiComplete(options: AIRequestOptions): Promise<AIResponse> {
  const { messages, maxTokens = 2000, temperature = 0.7, requestId, userId } = options;
  const feature = normalizeAIFeatureKey(options.feature ?? "legacy.ai-complete");
  const startedAt = new Date();
  const [providerConfigs, policy] = await Promise.all([
    loadProviderConfigs(),
    loadPolicy(feature),
  ]);
  const plan = resolveAIRoutingPlan({ feature, providerConfigs, policy });
  const requestPlan = {
    ...plan,
    attempts: plan.attempts.map((attempt) => ({
      ...attempt,
      maxTokens: attempt.maxTokens ?? maxTokens,
      temperature: attempt.temperature ?? temperature,
    })),
  };
  enforceAIBudget({
    requestedTokens: maxTokens,
    policy,
    snapshot: await budgetSnapshot(feature, userId),
  });

  const aiRequest = await db.aIRequest.create({
    data: {
      feature,
      userId: userId ?? null,
      status: AIRequestStatus.RUNNING,
      metadata: requestId ? { requestId } : undefined,
      startedAt,
    },
  });

  try {
    const { response, attempts } = await runAIGatewayFallbackWithCredentials({
      plan: requestPlan,
      request: {
        requestId,
        messages,
      },
      resolveAdapters: async (provider) => adaptersForCredentials(
        await listActiveCredentialsForProvider({ provider })
      ),
    });
    const providerConfig = providerConfigs.find((config) => config.provider === response.provider);
    const estimatedCostMicros = estimateAICostMicros({
      promptTokens: response.promptTokens,
      completionTokens: response.completionTokens,
    }, {
      inputTokenCostMicros: providerConfig?.inputTokenCostMicros,
      outputTokenCostMicros: providerConfig?.outputTokenCostMicros,
    });

    await Promise.all([
      ...attempts.map((attempt) => db.aIAttempt.create({
        data: {
          aiRequestId: aiRequest.id,
          provider: attempt.provider,
          model: attempt.model ?? "unknown",
          status: attemptStatus(attempt),
          errorCode: attempt.code ?? null,
          finishedAt: new Date(),
        },
      })),
      db.aIRequest.update({
        where: { id: aiRequest.id },
        data: {
          status: AIRequestStatus.SUCCEEDED,
          promptTokens: response.promptTokens,
          completionTokens: response.completionTokens,
          totalTokens: response.totalTokens,
          estimatedCostMicros,
          finishedAt: new Date(),
        },
      }),
      recordAIUsageLedger({
        feature,
        userId,
        tokens: response.totalTokens,
        costMicros: estimatedCostMicros,
      }),
      ...attempts.flatMap((attempt) => {
        if (!attempt.credentialId) return [];
        if (attempt.status === "succeeded") {
          return [markCredentialSuccess({ credentialId: attempt.credentialId })];
        }
        if (attempt.status === "failed") {
          const classification = classifyCredentialFailure(attempt.code);
          return [markCredentialFailure({
            credentialId: attempt.credentialId,
            code: attempt.code ?? "PROVIDER_ERROR",
            cooldownMs: classification.cooldownMs,
            regionBlocked: classification.regionBlocked,
          })];
        }
        return [];
      }),
    ]);

    log.info("ai-gateway-request-succeeded", {
      requestId,
      feature,
      provider: response.provider,
      model: response.model,
      tokensIn: response.promptTokens,
      tokensOut: response.completionTokens,
      latencyMs: response.latencyMs,
    });

    return {
      text: response.text,
      model: response.model,
      provider: providerLabel(response.provider),
      tokensIn: response.promptTokens,
      tokensOut: response.completionTokens,
      latencyMs: response.latencyMs,
    };
  } catch (err) {
    const failedAttempts = err instanceof AIGatewayRoutingError ? err.attempts ?? [] : [];
    await db.aIRequest.update({
      where: { id: aiRequest.id },
      data: {
        status: AIRequestStatus.FAILED,
        finishedAt: new Date(),
      },
    }).catch(() => undefined);
    await Promise.all([
      ...failedAttempts.map((attempt) => db.aIAttempt.create({
        data: {
          aiRequestId: aiRequest.id,
          provider: attempt.provider,
          model: attempt.model ?? "unknown",
          status: attemptStatus(attempt),
          errorCode: attempt.code ?? null,
          finishedAt: new Date(),
        },
      })),
      ...failedAttempts.flatMap((attempt) => {
        if (!attempt.credentialId || attempt.status !== "failed") return [];
        const classification = classifyCredentialFailure(attempt.code);
        return [markCredentialFailure({
          credentialId: attempt.credentialId,
          code: attempt.code ?? "PROVIDER_ERROR",
          cooldownMs: classification.cooldownMs,
          regionBlocked: classification.regionBlocked,
        })];
      }),
    ]).catch((recordErr) => {
      log.warn("ai-gateway-failed-attempt-recording-failed", {
        requestId,
        feature,
        error: serializeError(recordErr),
      });
    });

    log.error("ai-gateway-request-failed", {
      requestId,
      feature,
      error: serializeError(err),
    });

    if (err instanceof AIProviderError) {
      throw new Error(`AI provider unavailable: ${err.code}`);
    }
    throw err;
  }
}
