import { AIProvider } from "@prisma/client";
import { isCloudflareAIGatewayUrl } from "@/lib/ai-gateway/cloudflare-gateway";
import type { AICredentialAttempt, AIRoutingAttemptPlan, AIRoutingProviderConfig } from "@/lib/ai-gateway/routing";
import { cloudflareAIGatewayEnabledForRU, isYandexOnlyLLMMode } from "@/lib/env";

export type AIProviderGroup = "yandex" | "foreign";
export type AIProviderRegion = "ru" | "foreign";

export interface AIRoutingProof {
  providerGroup: AIProviderGroup;
  providerRegion: AIProviderRegion;
  cloudflareAIGatewayUsed: boolean;
  foreignLLMUsed: boolean;
  crossBorderProcessing: boolean;
}

export class AIRoutingPolicyViolationError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "AIRoutingPolicyViolationError";
    this.code = code;
  }
}

export function providerGroup(provider: AIProvider): AIProviderGroup {
  return provider === AIProvider.YANDEX ? "yandex" : "foreign";
}

export function providerRegion(provider: AIProvider): AIProviderRegion {
  return provider === AIProvider.YANDEX ? "ru" : "foreign";
}

export function providerForeignLLMUsed(provider: AIProvider) {
  return provider !== AIProvider.YANDEX;
}

export function providerConfigRequestsCloudflareAIGateway(config?: Pick<AIRoutingProviderConfig, "baseUrl" | "cloudflareGatewayEnabled"> | null) {
  return config?.cloudflareGatewayEnabled === true || isCloudflareAIGatewayUrl(config?.baseUrl);
}

export function providerConfigUsesCloudflareAIGateway(config?: Pick<AIRoutingProviderConfig, "baseUrl" | "cloudflareGatewayEnabled"> | null) {
  return cloudflareAIGatewayEnabledForRU() && providerConfigRequestsCloudflareAIGateway(config);
}

export function routingProofForProvider(input: {
  provider: AIProvider;
  providerConfig?: Pick<AIRoutingProviderConfig, "baseUrl" | "cloudflareGatewayEnabled"> | null;
}): AIRoutingProof {
  const foreignLLMUsed = providerForeignLLMUsed(input.provider);
  const cloudflareAIGatewayUsed = providerConfigUsesCloudflareAIGateway(input.providerConfig);
  return {
    providerGroup: providerGroup(input.provider),
    providerRegion: providerRegion(input.provider),
    cloudflareAIGatewayUsed,
    foreignLLMUsed,
    crossBorderProcessing: foreignLLMUsed || cloudflareAIGatewayUsed,
  };
}

export function combineRoutingProofs(proofs: AIRoutingProof[]): AIRoutingProof {
  const hasForeign = proofs.some((proof) => proof.foreignLLMUsed);
  const hasCloudflare = proofs.some((proof) => proof.cloudflareAIGatewayUsed);
  const allYandex = proofs.length > 0 && proofs.every((proof) => proof.providerGroup === "yandex");
  return {
    providerGroup: allYandex ? "yandex" : "foreign",
    providerRegion: allYandex ? "ru" : "foreign",
    cloudflareAIGatewayUsed: hasCloudflare,
    foreignLLMUsed: hasForeign,
    crossBorderProcessing: proofs.some((proof) => proof.crossBorderProcessing) || hasForeign || hasCloudflare,
  };
}

export function enforceYandexOnlyRoutingProof(input: {
  plan: { attempts: AIRoutingAttemptPlan[] };
  providerConfigsByName: Map<AIProvider, AIRoutingProviderConfig>;
}) {
  if (!isYandexOnlyLLMMode()) return;

  for (const attempt of input.plan.attempts) {
    if (attempt.provider !== AIProvider.YANDEX) {
      throw new AIRoutingPolicyViolationError(
        "Yandex-only mode blocked a foreign LLM provider in the RU routing plan",
        "RU_FOREIGN_LLM_BLOCKED",
      );
    }

    if (providerConfigRequestsCloudflareAIGateway(input.providerConfigsByName.get(attempt.provider))) {
      throw new AIRoutingPolicyViolationError(
        "Yandex-only mode blocked Cloudflare AI Gateway in the RU prompt path",
        "RU_CLOUDFLARE_GATEWAY_BLOCKED",
      );
    }
  }
}

export function attemptRoutingProof(input: {
  attempt: Pick<AICredentialAttempt, "provider">;
  providerConfig?: AIRoutingProviderConfig | null;
}) {
  return routingProofForProvider({
    provider: input.attempt.provider,
    providerConfig: input.providerConfig,
  });
}
