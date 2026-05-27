import { AIProvider, type AIProviderConfig, type AIRoutingPolicy } from "@prisma/client";
import db from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { AI_PROVIDER_LABELS, aiBudgetPeriod, normalizeAIFeatureKey } from "@/lib/ai-gateway/domain";
import { listAdminAIInteractions } from "@/lib/ai-gateway/interactions";
import { listAIPromptConfigs } from "@/lib/ai-gateway/prompts";
import { getAIUsageDetails, getAIUsageLedger } from "@/lib/ai-gateway/usage";
import { listCredentials } from "@/lib/ai-gateway/credentials";
import { isAICredentialEncryptionConfigured } from "@/lib/ai-gateway/credentials-crypto";
import { listCachedModels } from "@/lib/ai-gateway/models";
import {
  buildCloudflareGatewayUrl,
  buildCloudflareGatewayUrlForAIProvider,
  getCloudflareGatewayConfig,
} from "@/lib/ai-gateway/cloudflare-gateway";
import { mergeAITaskPolicies } from "@/lib/ai-gateway/task-policy";
import { cloudflareGatewayEnabled } from "@/lib/ai-gateway/provider-runtime";

export interface AIProviderConfigInput {
  provider: AIProvider;
  enabled: boolean;
  priority: number;
  baseUrl?: string | null;
  defaultModel?: string | null;
  timeoutMs: number;
  inputTokenCostMicros?: number | null;
  outputTokenCostMicros?: number | null;
  cloudflareGatewayEnabled?: boolean;
}

export interface AIRoutingPolicyInput {
  feature: string;
  enabled: boolean;
  providerOrder: AIProvider[];
  modelPreferences?: Record<string, string> | null;
  maxTokens?: number | null;
  temperature?: number | null;
  timeoutMs?: number | null;
  dailyTokenBudget?: number | null;
  perUserDailyTokenBudget?: number | null;
}

const DEFAULT_PROVIDER_CONFIGS: AIProviderConfigInput[] = [
  { provider: AIProvider.OPENROUTER, enabled: true, priority: 10, defaultModel: "openrouter/free", timeoutMs: 30_000 },
  { provider: AIProvider.GEMINI, enabled: true, priority: 15, defaultModel: "gemini-2.5-flash", timeoutMs: 30_000 },
  { provider: AIProvider.OPENAI, enabled: true, priority: 20, defaultModel: "gpt-4o-mini", timeoutMs: 30_000 },
  { provider: AIProvider.ANTHROPIC, enabled: true, priority: 30, defaultModel: "claude-3-5-haiku-20241022", timeoutMs: 30_000 },
  { provider: AIProvider.FIREWORKS, enabled: true, priority: 40, defaultModel: "accounts/fireworks/models/kimi-k2p6", timeoutMs: 30_000 },
];

export async function getAIControlCenterData(period = aiBudgetPeriod(), options: { includeSecrets?: boolean } = {}) {
  const [
    storedProviders,
    policyRows,
    usage,
    usageDetails,
    credentials,
    prompts,
    interactions,
    openaiModels,
    anthropicModels,
    fireworksModels,
    openrouterModels,
    geminiModels,
  ] = await Promise.all([
    db.aIProviderConfig.findMany({ orderBy: [{ priority: "asc" }, { provider: "asc" }] }),
    db.aIRoutingPolicy.findMany({ orderBy: { feature: "asc" } }),
    getAIUsageLedger(period),
    getAIUsageDetails(period),
    listCredentials(undefined, { includeSecrets: options.includeSecrets }),
    listAIPromptConfigs(),
    options.includeSecrets ? listAdminAIInteractions({ period, limit: 40 }) : Promise.resolve([]),
    listCachedModels(AIProvider.OPENAI),
    listCachedModels(AIProvider.ANTHROPIC),
    listCachedModels(AIProvider.FIREWORKS),
    listCachedModels(AIProvider.OPENROUTER),
    listCachedModels(AIProvider.GEMINI),
  ]);

  const providerByName = new Map(storedProviders.map((provider) => [provider.provider, provider]));
  const providers = DEFAULT_PROVIDER_CONFIGS.map((fallback) => {
    const stored = providerByName.get(fallback.provider);
    if (!stored) {
      return {
        ...fallback,
        id: fallback.provider,
        displayName: AI_PROVIDER_LABELS[fallback.provider],
        rpmLimit: null,
        tpmLimit: null,
        metadata: null,
        cloudflareGatewayEnabled: false,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      };
    }
    return {
      ...stored,
      cloudflareGatewayEnabled: cloudflareGatewayEnabled(stored.metadata),
    };
  });

  const models: Record<AIProvider, typeof openaiModels> = {
    [AIProvider.OPENAI]: openaiModels,
    [AIProvider.ANTHROPIC]: anthropicModels,
    [AIProvider.FIREWORKS]: fireworksModels,
    [AIProvider.OPENROUTER]: openrouterModels,
    [AIProvider.GEMINI]: geminiModels,
  };

  const cfGateway = getCloudflareGatewayConfig();
  const cloudflareGateway = cfGateway
    ? {
      configured: true as const,
      accountId: cfGateway.accountId,
      gatewayId: cfGateway.gatewayId,
      hasToken: cfGateway.hasToken,
      openaiUrl: buildCloudflareGatewayUrl({
        accountId: cfGateway.accountId,
        gatewayId: cfGateway.gatewayId,
        provider: "openai",
      }),
      providerUrls: Object.fromEntries(
        DEFAULT_PROVIDER_CONFIGS.map((provider) => [
          provider.provider,
          buildCloudflareGatewayUrlForAIProvider({
            accountId: cfGateway.accountId,
            gatewayId: cfGateway.gatewayId,
            provider: provider.provider,
          }),
        ]),
      ),
    }
    : { configured: false as const };

  return {
    providers,
    policies: mergeAITaskPolicies(policyRows),
    usage,
    usageDetails,
    credentials,
    prompts,
    interactions,
    models,
    encryptionConfigured: isAICredentialEncryptionConfigured(),
    cloudflareGateway,
    period,
  };
}

export async function updateAIProviderConfig(actorId: string, input: AIProviderConfigInput): Promise<AIProviderConfig> {
  const metadata = {
    cloudflareGatewayEnabled: input.cloudflareGatewayEnabled === true,
  };
  const providerConfig = await db.aIProviderConfig.upsert({
    where: { provider: input.provider },
    create: {
      provider: input.provider,
      displayName: AI_PROVIDER_LABELS[input.provider],
      enabled: input.enabled,
      priority: input.priority,
      baseUrl: input.baseUrl || null,
      defaultModel: input.defaultModel || null,
      timeoutMs: input.timeoutMs,
      inputTokenCostMicros: input.inputTokenCostMicros ?? null,
      outputTokenCostMicros: input.outputTokenCostMicros ?? null,
      metadata,
    },
    update: {
      enabled: input.enabled,
      priority: input.priority,
      baseUrl: input.baseUrl || null,
      defaultModel: input.defaultModel || null,
      timeoutMs: input.timeoutMs,
      inputTokenCostMicros: input.inputTokenCostMicros ?? null,
      outputTokenCostMicros: input.outputTokenCostMicros ?? null,
      metadata,
    },
  });

  await logAudit(actorId, "AI_PROVIDER_CONFIG_UPDATE", providerConfig.id, JSON.stringify({
    provider: input.provider,
    enabled: input.enabled,
    priority: input.priority,
    defaultModel: input.defaultModel,
    timeoutMs: input.timeoutMs,
    cloudflareGatewayEnabled: input.cloudflareGatewayEnabled === true,
  }));

  return providerConfig;
}

export async function updateAIRoutingPolicy(actorId: string, input: AIRoutingPolicyInput): Promise<AIRoutingPolicy> {
  const feature = normalizeAIFeatureKey(input.feature);
  const policy = await db.aIRoutingPolicy.upsert({
    where: { feature },
    create: {
      feature,
      enabled: input.enabled,
      providerOrder: input.providerOrder,
      modelPreferences: input.modelPreferences ?? undefined,
      maxTokens: input.maxTokens ?? null,
      temperature: input.temperature ?? null,
      timeoutMs: input.timeoutMs ?? null,
      dailyTokenBudget: input.dailyTokenBudget ?? null,
      perUserDailyTokenBudget: input.perUserDailyTokenBudget ?? null,
    },
    update: {
      enabled: input.enabled,
      providerOrder: input.providerOrder,
      modelPreferences: input.modelPreferences ?? undefined,
      maxTokens: input.maxTokens ?? null,
      temperature: input.temperature ?? null,
      timeoutMs: input.timeoutMs ?? null,
      dailyTokenBudget: input.dailyTokenBudget ?? null,
      perUserDailyTokenBudget: input.perUserDailyTokenBudget ?? null,
    },
  });

  await logAudit(actorId, "AI_ROUTING_POLICY_UPDATE", policy.id, JSON.stringify({
    feature,
    enabled: input.enabled,
    providerOrder: input.providerOrder,
    maxTokens: input.maxTokens,
    timeoutMs: input.timeoutMs,
    dailyTokenBudget: input.dailyTokenBudget,
    perUserDailyTokenBudget: input.perUserDailyTokenBudget,
  }));

  return policy;
}
