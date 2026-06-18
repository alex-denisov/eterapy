import { AIProvider, type AIProviderConfig } from "@prisma/client";
import type { AIGatewayAdapter } from "@/lib/ai-gateway/adapters";
import { createAnthropicAdapter } from "@/lib/ai-gateway/anthropic-adapter";
import {
  buildCloudflareGatewayUrlForAIProvider,
  getCloudflareGatewayConfig,
  isCloudflareAIGatewayUrl,
} from "@/lib/ai-gateway/cloudflare-gateway";
import type { DecryptedAICredential } from "@/lib/ai-gateway/credentials";
import { createFireworksAdapter } from "@/lib/ai-gateway/fireworks-adapter";
import { createGeminiAdapter } from "@/lib/ai-gateway/gemini-adapter";
import { createOpenAICompatibleAdapter } from "@/lib/ai-gateway/openai-compatible-adapter";
import { createOpenAIAdapter } from "@/lib/ai-gateway/openai-adapter";
import { createOpenRouterAdapter } from "@/lib/ai-gateway/openrouter-adapter";
import { createYandexAdapter, DEFAULT_YANDEX_MODEL, YANDEX_FOUNDATION_MODELS_BASE_URL } from "@/lib/ai-gateway/yandex-adapter";
import { cloudflareAIGatewayEnabledForRU, getYandexAIStudioEnv } from "@/lib/env";
import type { AIRoutingProviderConfig } from "@/lib/ai-gateway/routing";

export const DIRECT_PROVIDER_BASE_URLS: Record<AIProvider, string | null> = {
  [AIProvider.OPENAI]: "https://api.openai.com/v1",
  [AIProvider.ANTHROPIC]: "https://api.anthropic.com/v1",
  [AIProvider.FIREWORKS]: "https://api.fireworks.ai/inference/v1",
  [AIProvider.OPENROUTER]: "https://openrouter.ai/api/v1",
  [AIProvider.GEMINI]: "https://generativelanguage.googleapis.com/v1beta",
  [AIProvider.GROQ]: "https://api.groq.com/openai/v1",
  [AIProvider.MISTRAL]: "https://api.mistral.ai/v1",
  [AIProvider.CEREBRAS]: "https://api.cerebras.ai/v1",
  [AIProvider.COHERE]: "https://api.cohere.ai/compatibility/v1",
  [AIProvider.YANDEX]: YANDEX_FOUNDATION_MODELS_BASE_URL,
};

export const DEFAULT_PROVIDER_MODELS: Record<AIProvider, string> = {
  [AIProvider.OPENAI]: "gpt-4.1-mini",
  [AIProvider.ANTHROPIC]: "claude-3-5-haiku-20241022",
  [AIProvider.FIREWORKS]: "accounts/fireworks/models/gpt-oss-120b",
  [AIProvider.OPENROUTER]: "openrouter/free",
  [AIProvider.GEMINI]: "gemini-2.5-flash",
  [AIProvider.GROQ]: "llama-3.1-8b-instant",
  [AIProvider.MISTRAL]: "mistral-small-latest",
  [AIProvider.CEREBRAS]: "zai-glm-4.7",
  [AIProvider.COHERE]: "command-r",
  [AIProvider.YANDEX]: DEFAULT_YANDEX_MODEL,
};

export function cloudflareGatewayEnabled(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  return (metadata as Record<string, unknown>).cloudflareGatewayEnabled === true;
}

export function providerConfigToRouting(row: AIProviderConfig): AIRoutingProviderConfig {
  return {
    provider: row.provider,
    enabled: row.enabled,
    priority: row.priority,
    baseUrl: row.baseUrl,
    defaultModel: row.defaultModel,
    timeoutMs: row.timeoutMs,
    inputTokenCostMicros: row.inputTokenCostMicros,
    outputTokenCostMicros: row.outputTokenCostMicros,
    cloudflareGatewayEnabled: cloudflareGatewayEnabled(row.metadata),
  };
}

export function resolvedProviderBaseUrl(input: {
  credential?: Pick<DecryptedAICredential, "baseUrlOverride"> | null;
  providerConfig?: Pick<AIRoutingProviderConfig, "provider" | "baseUrl" | "cloudflareGatewayEnabled"> | null;
}) {
  const cfGatewayEnabled = cloudflareAIGatewayEnabledForRU();
  if (input.credential?.baseUrlOverride) {
    if (!isCloudflareAIGatewayUrl(input.credential.baseUrlOverride) || cfGatewayEnabled) {
      return input.credential.baseUrlOverride;
    }
  }

  const config = input.providerConfig;
  const cfEnabled = config?.cloudflareGatewayEnabled === true && cfGatewayEnabled;
  const isYandex = config?.provider === AIProvider.YANDEX;

  if (config?.baseUrl) {
    // Self-heal stale rows: if the gateway is OFF but a Cloudflare Gateway URL
    // was left behind in `baseUrl` (e.g. saved before the toggle was wired),
    // ignore it and fall through to the provider's standard direct URL so the
    // provider works directly instead of being stuck "в ошибке". A genuine
    // non-CF custom base URL is still respected.
    if (!(isCloudflareAIGatewayUrl(config.baseUrl) && !cfEnabled)) {
      return config.baseUrl;
    }
  }

  if (cfEnabled && config && !isYandex) {
    const gateway = getCloudflareGatewayConfig();
    if (gateway) {
      const cfUrl = buildCloudflareGatewayUrlForAIProvider({
        accountId: gateway.accountId,
        gatewayId: gateway.gatewayId,
        provider: config.provider,
      });
      if (cfUrl) return cfUrl;
    }
  }

  // CF off (or unsupported / not configured): fall back to the standard
  // direct base URL for the provider. Adapters that carry their own default
  // can still receive undefined and use it.
  if (config) {
    const direct = DIRECT_PROVIDER_BASE_URLS[config.provider];
    if (direct) return direct;
  }
  return undefined;
}

export function buildAdapterForCredential(
  credential: DecryptedAICredential,
  providerConfig?: AIRoutingProviderConfig | null,
): AIGatewayAdapter {
  const baseURL = resolvedProviderBaseUrl({ credential, providerConfig });
  const opts = {
    apiKey: credential.apiKey,
    ...(baseURL ? { baseURL } : {}),
    ...(credential.modelOverride || providerConfig?.defaultModel ? {
      defaultModel: credential.modelOverride ?? providerConfig?.defaultModel ?? undefined,
    } : {}),
    ...(providerConfig?.timeoutMs ? { timeoutMs: providerConfig.timeoutMs } : {}),
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
    case AIProvider.GEMINI:
      return createGeminiAdapter(opts);
    case AIProvider.YANDEX: {
      const yandexEnv = getYandexAIStudioEnv();
      const yandexBaseURL = opts.baseURL && !isCloudflareAIGatewayUrl(opts.baseURL)
        ? opts.baseURL
        : yandexEnv.baseURL;
      return createYandexAdapter({
        apiKey: credential.apiKey || yandexEnv.apiKey,
        folderId: yandexEnv.folderId,
        baseURL: yandexBaseURL,
        ocrBaseURL: yandexEnv.ocrBaseURL,
        defaultModel: opts.defaultModel ?? DEFAULT_PROVIDER_MODELS[AIProvider.YANDEX],
        ...(providerConfig?.timeoutMs ? { timeoutMs: providerConfig.timeoutMs } : {}),
      });
    }
    case AIProvider.GROQ:
      return createOpenAICompatibleAdapter({
        ...opts,
        provider: AIProvider.GROQ,
        providerSlug: "Groq",
        missingConfigMessage: "Groq API key is not configured",
        baseURL: opts.baseURL ?? DIRECT_PROVIDER_BASE_URLS[AIProvider.GROQ]!,
        defaultModel: opts.defaultModel ?? DEFAULT_PROVIDER_MODELS[AIProvider.GROQ],
      });
    case AIProvider.MISTRAL:
      return createOpenAICompatibleAdapter({
        ...opts,
        provider: AIProvider.MISTRAL,
        providerSlug: "Mistral",
        missingConfigMessage: "Mistral API key is not configured",
        baseURL: opts.baseURL ?? DIRECT_PROVIDER_BASE_URLS[AIProvider.MISTRAL]!,
        defaultModel: opts.defaultModel ?? DEFAULT_PROVIDER_MODELS[AIProvider.MISTRAL],
      });
    case AIProvider.CEREBRAS:
      return createOpenAICompatibleAdapter({
        ...opts,
        provider: AIProvider.CEREBRAS,
        providerSlug: "Cerebras",
        missingConfigMessage: "Cerebras API key is not configured",
        baseURL: opts.baseURL ?? DIRECT_PROVIDER_BASE_URLS[AIProvider.CEREBRAS]!,
        defaultModel: opts.defaultModel ?? DEFAULT_PROVIDER_MODELS[AIProvider.CEREBRAS],
      });
    case AIProvider.COHERE:
      return createOpenAICompatibleAdapter({
        ...opts,
        provider: AIProvider.COHERE,
        providerSlug: "Cohere",
        missingConfigMessage: "Cohere API key is not configured",
        baseURL: opts.baseURL ?? DIRECT_PROVIDER_BASE_URLS[AIProvider.COHERE]!,
        defaultModel: opts.defaultModel ?? DEFAULT_PROVIDER_MODELS[AIProvider.COHERE],
      });
  }
}

export function providerLabel(provider: AIProvider): "openrouter" | "openai" | "anthropic" | "fireworks" | "gemini" | "groq" | "mistral" | "cerebras" | "cohere" | "yandex" {
  if (provider === AIProvider.OPENROUTER) return "openrouter";
  if (provider === AIProvider.OPENAI) return "openai";
  if (provider === AIProvider.ANTHROPIC) return "anthropic";
  if (provider === AIProvider.GEMINI) return "gemini";
  if (provider === AIProvider.GROQ) return "groq";
  if (provider === AIProvider.MISTRAL) return "mistral";
  if (provider === AIProvider.CEREBRAS) return "cerebras";
  if (provider === AIProvider.COHERE) return "cohere";
  if (provider === AIProvider.YANDEX) return "yandex";
  return "fireworks";
}
