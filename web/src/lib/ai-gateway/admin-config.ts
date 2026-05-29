import { AIProvider, type AIProviderConfig, type AIRoutingPolicy } from "@prisma/client";
import db from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { AI_GATEWAY_PROVIDERS, AI_PROVIDER_LABELS, aiBudgetPeriod, normalizeAIFeatureKey } from "@/lib/ai-gateway/domain";
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
  isCloudflareAIGatewayUrl,
} from "@/lib/ai-gateway/cloudflare-gateway";
import { mergeAITaskPolicies } from "@/lib/ai-gateway/task-policy";
import {
  DEFAULT_PROVIDER_MODELS,
  DIRECT_PROVIDER_BASE_URLS,
  cloudflareGatewayEnabled,
} from "@/lib/ai-gateway/provider-runtime";

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
  { provider: AIProvider.OPENROUTER, enabled: true, priority: 10, baseUrl: DIRECT_PROVIDER_BASE_URLS[AIProvider.OPENROUTER], defaultModel: DEFAULT_PROVIDER_MODELS[AIProvider.OPENROUTER], timeoutMs: 30_000, inputTokenCostMicros: 0, outputTokenCostMicros: 0 },
  { provider: AIProvider.GROQ, enabled: true, priority: 15, baseUrl: DIRECT_PROVIDER_BASE_URLS[AIProvider.GROQ], defaultModel: DEFAULT_PROVIDER_MODELS[AIProvider.GROQ], timeoutMs: 30_000, inputTokenCostMicros: 50, outputTokenCostMicros: 80 },
  { provider: AIProvider.MISTRAL, enabled: true, priority: 18, baseUrl: DIRECT_PROVIDER_BASE_URLS[AIProvider.MISTRAL], defaultModel: DEFAULT_PROVIDER_MODELS[AIProvider.MISTRAL], timeoutMs: 30_000, inputTokenCostMicros: 100, outputTokenCostMicros: 300 },
  { provider: AIProvider.GEMINI, enabled: true, priority: 20, baseUrl: DIRECT_PROVIDER_BASE_URLS[AIProvider.GEMINI], defaultModel: DEFAULT_PROVIDER_MODELS[AIProvider.GEMINI], timeoutMs: 30_000, inputTokenCostMicros: 300, outputTokenCostMicros: 2500 },
  { provider: AIProvider.CEREBRAS, enabled: true, priority: 25, baseUrl: DIRECT_PROVIDER_BASE_URLS[AIProvider.CEREBRAS], defaultModel: DEFAULT_PROVIDER_MODELS[AIProvider.CEREBRAS], timeoutMs: 30_000, inputTokenCostMicros: 250, outputTokenCostMicros: 690 },
  { provider: AIProvider.COHERE, enabled: true, priority: 30, baseUrl: DIRECT_PROVIDER_BASE_URLS[AIProvider.COHERE], defaultModel: DEFAULT_PROVIDER_MODELS[AIProvider.COHERE], timeoutMs: 30_000, inputTokenCostMicros: 150, outputTokenCostMicros: 600 },
  { provider: AIProvider.OPENAI, enabled: true, priority: 35, baseUrl: DIRECT_PROVIDER_BASE_URLS[AIProvider.OPENAI], defaultModel: DEFAULT_PROVIDER_MODELS[AIProvider.OPENAI], timeoutMs: 30_000, inputTokenCostMicros: 400, outputTokenCostMicros: 1600 },
  { provider: AIProvider.ANTHROPIC, enabled: true, priority: 40, baseUrl: DIRECT_PROVIDER_BASE_URLS[AIProvider.ANTHROPIC], defaultModel: DEFAULT_PROVIDER_MODELS[AIProvider.ANTHROPIC], timeoutMs: 30_000, inputTokenCostMicros: 800, outputTokenCostMicros: 4000 },
  { provider: AIProvider.FIREWORKS, enabled: true, priority: 45, baseUrl: DIRECT_PROVIDER_BASE_URLS[AIProvider.FIREWORKS], defaultModel: DEFAULT_PROVIDER_MODELS[AIProvider.FIREWORKS], timeoutMs: 30_000, inputTokenCostMicros: 900, outputTokenCostMicros: 900 },
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
    modelLists,
  ] = await Promise.all([
    db.aIProviderConfig.findMany({ orderBy: [{ priority: "asc" }, { provider: "asc" }] }),
    db.aIRoutingPolicy.findMany({ orderBy: { feature: "asc" } }),
    getAIUsageLedger(period),
    getAIUsageDetails(period),
    listCredentials(undefined, { includeSecrets: options.includeSecrets }),
    listAIPromptConfigs(),
    options.includeSecrets ? listAdminAIInteractions({ period, daysBack: 7, limit: 80 }) : Promise.resolve([]),
    Promise.all(AI_GATEWAY_PROVIDERS.map(async (provider) => [provider, await listCachedModels(provider)] as const)),
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

  const models = Object.fromEntries(modelLists) as Record<AIProvider, Awaited<ReturnType<typeof listCachedModels>>>;

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
  const cfGateway = getCloudflareGatewayConfig();
  const cfBaseUrl = cfGateway
    ? buildCloudflareGatewayUrlForAIProvider({
      accountId: cfGateway.accountId,
      gatewayId: cfGateway.gatewayId,
      provider: input.provider,
    })
    : null;
  const directBaseUrl = DIRECT_PROVIDER_BASE_URLS[input.provider];
  const requestedBaseUrl = input.baseUrl || null;

  // CF Gateway is only actually applied when it is requested AND the provider
  // is supported AND a gateway URL could be built (env configured). Otherwise
  // the provider runs directly — even if the admin left the checkbox checked
  // for an unsupported provider, so the stored metadata reflects reality.
  const cfApplied = input.cloudflareGatewayEnabled === true && Boolean(cfBaseUrl);

  // Server-authoritative base URL resolution (self-healing):
  //   • CF on + supported  → the Cloudflare Gateway URL
  //   • CF off / unsupported → the admin's explicit *non-CF* custom URL if
  //     they typed one, otherwise the provider's standard direct base URL.
  // This guarantees we never persist a stale/empty/dead Cloudflare URL when
  // the gateway is turned off, which was leaving providers stuck "в ошибке".
  const baseUrl = cfApplied
    ? cfBaseUrl
    : (requestedBaseUrl && !isCloudflareAIGatewayUrl(requestedBaseUrl))
      ? requestedBaseUrl
      : (directBaseUrl ?? requestedBaseUrl);
  const metadata = {
    cloudflareGatewayEnabled: cfApplied,
  };
  const providerConfig = await db.aIProviderConfig.upsert({
    where: { provider: input.provider },
    create: {
      provider: input.provider,
      displayName: AI_PROVIDER_LABELS[input.provider],
      enabled: input.enabled,
      priority: input.priority,
      baseUrl,
      defaultModel: input.defaultModel || null,
      timeoutMs: input.timeoutMs,
      inputTokenCostMicros: input.inputTokenCostMicros ?? null,
      outputTokenCostMicros: input.outputTokenCostMicros ?? null,
      metadata,
    },
    update: {
      enabled: input.enabled,
      priority: input.priority,
      baseUrl,
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
