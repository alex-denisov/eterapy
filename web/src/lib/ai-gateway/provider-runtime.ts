import { AIProvider, type AIProviderConfig } from "@prisma/client";
import type { AIGatewayAdapter } from "@/lib/ai-gateway/adapters";
import { createAnthropicAdapter } from "@/lib/ai-gateway/anthropic-adapter";
import {
  buildCloudflareGatewayUrlForAIProvider,
  getCloudflareGatewayConfig,
} from "@/lib/ai-gateway/cloudflare-gateway";
import type { DecryptedAICredential } from "@/lib/ai-gateway/credentials";
import { createFireworksAdapter } from "@/lib/ai-gateway/fireworks-adapter";
import { createGeminiAdapter } from "@/lib/ai-gateway/gemini-adapter";
import { createOpenAIAdapter } from "@/lib/ai-gateway/openai-adapter";
import { createOpenRouterAdapter } from "@/lib/ai-gateway/openrouter-adapter";
import type { AIRoutingProviderConfig } from "@/lib/ai-gateway/routing";

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
  if (input.credential?.baseUrlOverride) return input.credential.baseUrlOverride;
  if (input.providerConfig?.baseUrl) return input.providerConfig.baseUrl;
  if (!input.providerConfig?.cloudflareGatewayEnabled) return undefined;

  const gateway = getCloudflareGatewayConfig();
  if (!gateway) return undefined;
  return buildCloudflareGatewayUrlForAIProvider({
    accountId: gateway.accountId,
    gatewayId: gateway.gatewayId,
    provider: input.providerConfig.provider,
  }) ?? undefined;
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
  }
}

export function providerLabel(provider: AIProvider): "openrouter" | "openai" | "anthropic" | "fireworks" | "gemini" {
  if (provider === AIProvider.OPENROUTER) return "openrouter";
  if (provider === AIProvider.OPENAI) return "openai";
  if (provider === AIProvider.ANTHROPIC) return "anthropic";
  if (provider === AIProvider.GEMINI) return "gemini";
  return "fireworks";
}
