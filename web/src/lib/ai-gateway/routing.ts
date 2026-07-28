import { AIProvider } from "@prisma/client";
import {
  AIProviderError,
  type AIGatewayAdapter,
  type AIGatewayCompletionRequest,
  type AIGatewayCompletionResponse,
} from "@/lib/ai-gateway/adapters";
import { defaultProviderOrder, normalizeAIFeatureKey } from "@/lib/ai-gateway/domain";
import {
  getYandexFallbackModels,
  getYandexPrimaryModel,
  isYandexOnlyLLMMode,
} from "@/lib/env";
import { log } from "@/lib/logger";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_YANDEX_MODEL = "yandexgpt-lite/latest";

/**
 * Failure-handling decision for a credential attempt:
 * - retryNextCredential: try the next key of the SAME provider
 * - skipProvider: skip remaining keys of this provider, move to next provider
 * - stop: hard error, don't try any more providers either
 */
export type CredentialFailureDecision = "retryNextCredential" | "skipProvider" | "stop";

export function decideFailureFallback(code: string | undefined): CredentialFailureDecision {
  if (!code) return "retryNextCredential";
  if (code === "HTTP_403") return "skipProvider"; // region/forbidden — no other key on this provider will help
  if (code === "MODEL_NOT_ALLOWED") return "skipProvider";
  if (code === "MISSING_CONFIG") return "skipProvider";
  if (code === "MISSING_ADAPTER") return "skipProvider";
  if (code === "HTTP_400") return "skipProvider"; // bad payload — same on every key
  if (code === "HTTP_404") return "skipProvider"; // model not found — same on every key
  return "retryNextCredential";
}

export interface AIRoutingProviderConfig {
  provider: AIProvider;
  enabled: boolean;
  priority: number;
  baseUrl?: string | null;
  defaultModel?: string | null;
  timeoutMs?: number | null;
  inputTokenCostMicros?: number | null;
  outputTokenCostMicros?: number | null;
  cloudflareGatewayEnabled?: boolean;
}

export interface AIRoutingPolicyConfig {
  feature: string;
  enabled: boolean;
  providerOrder?: AIProvider[] | null;
  modelPreferences?: unknown;
  maxTokens?: number | null;
  temperature?: number | null;
  timeoutMs?: number | null;
  dailyTokenBudget?: number | null;
  perUserDailyTokenBudget?: number | null;
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
  attempts?: Array<AIGatewayFallbackAttempt & { credentialId?: string; credentialLabel?: string }>;

  constructor(message: string, code: string, attempts?: Array<AIGatewayFallbackAttempt & { credentialId?: string; credentialLabel?: string }>) {
    super(message);
    this.name = "AIGatewayRoutingError";
    this.code = code;
    this.attempts = attempts;
  }
}

function canFallbackFromProviderError(error: AIProviderError) {
  return error.retryable || [
    "MISSING_CONFIG",
    "HTTP_401",
    "HTTP_402",
    "HTTP_403",
  ].includes(error.code);
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

function uniqueModels(models: Array<string | null | undefined>) {
  const seen = new Set<string>();
  return models
    .map((model) => model?.trim())
    .filter((model): model is string => Boolean(model))
    .filter((model) => {
      if (seen.has(model)) return false;
      seen.add(model);
      return true;
    });
}

function resolveYandexOnlyRoutingPlan(input: {
  feature: string;
  providerConfigs: AIRoutingProviderConfig[];
  policy?: AIRoutingPolicyConfig | null;
}): AIRoutingPlan {
  const yandexConfig = input.providerConfigs.find((config) => config.provider === AIProvider.YANDEX);
  const timeoutMs = input.policy?.timeoutMs ?? yandexConfig?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxTokens = input.policy?.maxTokens ?? undefined;
  const temperature = input.policy?.temperature ?? undefined;
  const models = uniqueModels([
    modelPreferenceFor(input.policy?.modelPreferences, AIProvider.YANDEX),
    getYandexPrimaryModel(),
    yandexConfig?.defaultModel,
    ...getYandexFallbackModels(),
    DEFAULT_YANDEX_MODEL,
  ]);

  const attempts = models.map((model): AIRoutingAttemptPlan => ({
    provider: AIProvider.YANDEX,
    model,
    timeoutMs,
    ...(maxTokens !== undefined ? { maxTokens } : {}),
    ...(temperature !== undefined ? { temperature } : {}),
  }));

  if (attempts.length === 0) {
    throw new AIGatewayRoutingError(`No Yandex AI models are configured for ${input.feature}`, "NO_ENABLED_PROVIDERS");
  }

  return { feature: input.feature, attempts };
}

export function resolveAIRoutingPlan(input: {
  feature: string;
  providerConfigs: AIRoutingProviderConfig[];
  policy?: AIRoutingPolicyConfig | null;
  allowForeignInYandexOnlyMode?: boolean;
}): AIRoutingPlan {
  const feature = normalizeAIFeatureKey(input.feature);
  const policy = input.policy;

  if (policy && !policy.enabled) {
    throw new AIGatewayRoutingError(`AI routing policy is disabled for ${feature}`, "POLICY_DISABLED");
  }

  if (isYandexOnlyLLMMode() && !input.allowForeignInYandexOnlyMode) {
    return resolveYandexOnlyRoutingPlan({
      feature,
      providerConfigs: input.providerConfigs,
      policy,
    });
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

      if (!canFallbackFromProviderError(providerError)) {
        throw providerError;
      }
    }
  }

  throw new AIGatewayRoutingError(`All AI providers failed for ${input.plan.feature}`, "ALL_PROVIDERS_FAILED", attempts);
}

export interface AICredentialAdapter {
  credentialId: string;
  credentialLabel: string;
  adapter: AIGatewayAdapter;
}

export interface AICredentialAttempt extends AIGatewayFallbackAttempt {
  credentialId?: string;
  credentialLabel?: string;
}

/**
 * Smart fallback executor with per-credential rotation:
 * - For each provider in the routing plan, iterate its enabled credentials in LRU order.
 * - On per-credential failure, classify the error:
 *   - retryNextCredential: try the next key of the same provider
 *   - skipProvider: skip remaining keys of this provider, move to next provider
 *     (e.g. HTTP_403 region block — no other key on this provider will help)
 *   - stop: hard error, propagate immediately
 * - Returns on the first credential success.
 *
 * The retry is transparent to the caller — a single AIGatewayCompletionResponse
 * is produced and the attempts ledger records every key tried.
 */
export async function runAIGatewayFallbackWithCredentials(input: {
  plan: AIRoutingPlan;
  request: Omit<AIGatewayCompletionRequest, "feature" | "model" | "maxTokens" | "temperature" | "timeoutMs">;
  resolveAdapters: (provider: AIProvider) => Promise<AICredentialAdapter[]>;
}): Promise<{ response: AIGatewayCompletionResponse; attempts: AICredentialAttempt[] }> {
  const attempts: AICredentialAttempt[] = [];

  for (const attempt of input.plan.attempts) {
    const credentialAdapters = await input.resolveAdapters(attempt.provider);
    if (credentialAdapters.length === 0) {
      attempts.push({
        provider: attempt.provider,
        model: attempt.model,
        status: "skipped",
        code: "MISSING_ADAPTER",
        retryable: true,
      });
      continue;
    }

    let providerSkipped = false;
    for (const { credentialId, credentialLabel, adapter } of credentialAdapters) {
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
          credentialId,
          credentialLabel,
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
          credentialId,
          credentialLabel,
        });
        log.warn("ai-gateway-credential-attempt-failed", {
          feature: input.plan.feature,
          provider: attempt.provider,
          credentialId,
          credentialLabel,
          model: attempt.model,
          code: providerError.code,
          retryable: providerError.retryable,
        });

        const decision = decideFailureFallback(providerError.code);
        if (decision === "stop") {
          throw providerError;
        }
        if (decision === "skipProvider") {
          providerSkipped = true;
          break;
        }
        // retryNextCredential — fall through to next credential of same provider
      }
    }

    if (providerSkipped) {
      // explicit marker so observability/metrics see the skip
      log.info("ai-gateway-provider-skipped", {
        feature: input.plan.feature,
        provider: attempt.provider,
      });
    }
  }

  throw new AIGatewayRoutingError(`All AI providers failed for ${input.plan.feature}`, "ALL_PROVIDERS_FAILED", attempts);
}
