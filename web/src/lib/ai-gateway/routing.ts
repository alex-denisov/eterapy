import { AIProvider } from "@prisma/client";
import {
  AIProviderError,
  type AIGatewayAdapter,
  type AIGatewayCompletionRequest,
  type AIGatewayCompletionResponse,
} from "@/lib/ai-gateway/adapters";
import { defaultProviderOrder, normalizeAIFeatureKey } from "@/lib/ai-gateway/domain";
import { log } from "@/lib/logger";

const DEFAULT_TIMEOUT_MS = 30_000;

export interface AIRoutingProviderConfig {
  provider: AIProvider;
  enabled: boolean;
  priority: number;
  defaultModel?: string | null;
  timeoutMs?: number | null;
}

export interface AIRoutingPolicyConfig {
  feature: string;
  enabled: boolean;
  providerOrder?: AIProvider[] | null;
  modelPreferences?: unknown;
  maxTokens?: number | null;
  temperature?: number | null;
  timeoutMs?: number | null;
}

export interface AIRoutingAttemptPlan {
  provider: AIProvider;
  model?: string;
  timeoutMs: number;
  maxTokens?: number;
  temperature?: number;
}

export interface AIRoutingPlan {
  feature: string;
  attempts: AIRoutingAttemptPlan[];
}

export interface AIGatewayFallbackAttempt {
  provider: AIProvider;
  model?: string;
  status: "succeeded" | "failed" | "skipped";
  code?: string;
  retryable?: boolean;
}

export class AIGatewayRoutingError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "AIGatewayRoutingError";
    this.code = code;
  }
}

function uniqueProviderOrder(providers: AIProvider[]) {
  const seen = new Set<AIProvider>();
  return providers.filter((provider) => {
    if (seen.has(provider)) return false;
    seen.add(provider);
    return true;
  });
}

function modelPreferenceFor(modelPreferences: unknown, provider: AIProvider) {
  if (!modelPreferences || typeof modelPreferences !== "object" || Array.isArray(modelPreferences)) return undefined;
  const value = (modelPreferences as Record<string, unknown>)[provider];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function resolveAIRoutingPlan(input: {
  feature: string;
  providerConfigs: AIRoutingProviderConfig[];
  policy?: AIRoutingPolicyConfig | null;
}): AIRoutingPlan {
  const feature = normalizeAIFeatureKey(input.feature);
  const policy = input.policy;

  if (policy && !policy.enabled) {
    throw new AIGatewayRoutingError(`AI routing policy is disabled for ${feature}`, "POLICY_DISABLED");
  }

  const enabledConfigs = new Map(
    input.providerConfigs
      .filter((config) => config.enabled)
      .map((config) => [config.provider, config])
  );
  const priorityProviders = [...enabledConfigs.values()]
    .sort((a, b) => a.priority - b.priority)
    .map((config) => config.provider);
  const policyProviders = policy?.providerOrder?.length ? policy.providerOrder : defaultProviderOrder();
  const orderedProviders = uniqueProviderOrder([...policyProviders, ...priorityProviders]);

  const attempts = orderedProviders
    .map((provider): AIRoutingAttemptPlan | null => {
      const providerConfig = enabledConfigs.get(provider);
      if (!providerConfig) return null;
      const model = modelPreferenceFor(policy?.modelPreferences, provider) ?? providerConfig.defaultModel ?? undefined;
      const maxTokens = policy?.maxTokens ?? undefined;
      const temperature = policy?.temperature ?? undefined;
      return {
        provider,
        timeoutMs: policy?.timeoutMs ?? providerConfig.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        ...(model ? { model } : {}),
        ...(maxTokens !== undefined ? { maxTokens } : {}),
        ...(temperature !== undefined ? { temperature } : {}),
      };
    })
    .filter((attempt): attempt is AIRoutingAttemptPlan => Boolean(attempt));

  if (attempts.length === 0) {
    throw new AIGatewayRoutingError(`No enabled AI providers are available for ${feature}`, "NO_ENABLED_PROVIDERS");
  }

  return { feature, attempts };
}

export async function runAIGatewayFallback(input: {
  plan: AIRoutingPlan;
  adapters: Map<AIProvider, AIGatewayAdapter>;
  request: Omit<AIGatewayCompletionRequest, "feature" | "model" | "maxTokens" | "temperature" | "timeoutMs">;
}): Promise<{ response: AIGatewayCompletionResponse; attempts: AIGatewayFallbackAttempt[] }> {
  const attempts: AIGatewayFallbackAttempt[] = [];

  for (const attempt of input.plan.attempts) {
    const adapter = input.adapters.get(attempt.provider);
    if (!adapter) {
      attempts.push({
        provider: attempt.provider,
        model: attempt.model,
        status: "skipped",
        code: "MISSING_ADAPTER",
        retryable: true,
      });
      continue;
    }

    try {
      const response = await adapter.complete({
        ...input.request,
        feature: input.plan.feature,
        model: attempt.model,
        maxTokens: attempt.maxTokens,
        temperature: attempt.temperature,
        timeoutMs: attempt.timeoutMs,
      });
      attempts.push({
        provider: attempt.provider,
        model: response.model,
        status: "succeeded",
      });
      return { response, attempts };
    } catch (err) {
      const providerError = err instanceof AIProviderError
        ? err
        : new AIProviderError("AI provider failed", {
          provider: attempt.provider,
          code: "PROVIDER_ERROR",
          retryable: false,
          cause: err,
        });
      attempts.push({
        provider: attempt.provider,
        model: attempt.model,
        status: "failed",
        code: providerError.code,
        retryable: providerError.retryable,
      });
      log.warn("ai-gateway-fallback-attempt-failed", {
        feature: input.plan.feature,
        provider: attempt.provider,
        model: attempt.model,
        code: providerError.code,
        retryable: providerError.retryable,
      });

      if (!providerError.retryable) {
        throw providerError;
      }
    }
  }

  throw new AIGatewayRoutingError(`All AI providers failed for ${input.plan.feature}`, "ALL_PROVIDERS_FAILED");
}
