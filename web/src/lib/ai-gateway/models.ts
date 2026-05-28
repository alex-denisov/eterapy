import { AIProvider } from "@prisma/client";
import db from "@/lib/db";
import { log } from "@/lib/logger";
import {
  pickCredentialForProvider,
  type DecryptedAICredential,
} from "@/lib/ai-gateway/credentials";
import { cloudflareGatewayAuthHeaders } from "@/lib/ai-gateway/cloudflare-gateway";
import { isFreeOpenRouterModel } from "@/lib/ai-gateway/openrouter-adapter";
import {
  providerConfigToRouting,
  DIRECT_PROVIDER_BASE_URLS,
  resolvedProviderBaseUrl,
} from "@/lib/ai-gateway/provider-runtime";

export interface AIModelInfo {
  modelId: string;
  displayName?: string | null;
  isFree: boolean;
  contextWindow?: number | null;
  inputTokenCostMicros?: number | null;
  outputTokenCostMicros?: number | null;
  metadata?: unknown;
}

export interface CachedAIModel extends AIModelInfo {
  id: string;
  provider: AIProvider;
  fetchedAt: Date;
}

export class AIModelFetchError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "AIModelFetchError";
  }
}

const FETCH_TIMEOUT_MS = 15_000;

function microsPerThousand(usdPerMillion: number | null | undefined) {
  if (typeof usdPerMillion !== "number" || !Number.isFinite(usdPerMillion)) return null;
  return Math.round(usdPerMillion * 1000);
}

function openRouterUsdPerTokenToMicrosPerThousand(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 1_000_000_000);
}

const KNOWN_MODEL_PRICING_USD_PER_MILLION: Partial<Record<AIProvider, Record<string, { input: number; output: number }>>> = {
  [AIProvider.OPENAI]: {
    "gpt-4o-mini": { input: 0.15, output: 0.6 },
    "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  },
  [AIProvider.GEMINI]: {
    "gemini-2.5-flash": { input: 0.3, output: 2.5 },
    "gemini-2.0-flash": { input: 0.1, output: 0.4 },
  },
  [AIProvider.GROQ]: {
    "llama-3.1-8b-instant": { input: 0.05, output: 0.08 },
    "llama-3.3-70b-versatile": { input: 0.59, output: 0.79 },
    "qwen/qwen3-32b": { input: 0.29, output: 0.59 },
    "openai/gpt-oss-safeguard-20b": { input: 0.075, output: 0.3 },
  },
  [AIProvider.MISTRAL]: {
    "mistral-small-latest": { input: 0.1, output: 0.3 },
    "mistral-medium-latest": { input: 0.4, output: 2.0 },
    "mistral-medium-2505": { input: 0.4, output: 2.0 },
    "mistral-medium-2508": { input: 0.4, output: 2.0 },
  },
  [AIProvider.COHERE]: {
    "command-a-plus-05-2026": { input: 2.5, output: 10 },
    "command-a-03-2025": { input: 2.5, output: 10 },
    "command-r-plus": { input: 2.5, output: 10 },
    "command-r": { input: 0.15, output: 0.6 },
  },
  [AIProvider.CEREBRAS]: {
    "gpt-oss-120b": { input: 0.25, output: 0.69 },
    "zai-glm-4.7": { input: 0.25, output: 0.69 },
  },
  [AIProvider.FIREWORKS]: {
    "accounts/fireworks/models/kimi-k2p6": { input: 1.5, output: 6 },
    "accounts/fireworks/models/gpt-oss-120b": { input: 0.9, output: 0.9 },
  },
};

function knownModelPricing(provider: AIProvider, modelId: string) {
  const direct = KNOWN_MODEL_PRICING_USD_PER_MILLION[provider]?.[modelId];
  if (!direct) return { inputTokenCostMicros: null, outputTokenCostMicros: null };
  return {
    inputTokenCostMicros: microsPerThousand(direct.input),
    outputTokenCostMicros: microsPerThousand(direct.output),
  };
}

const OPENROUTER_META_MODELS: AIModelInfo[] = [
  {
    modelId: "openrouter/free",
    displayName: "OpenRouter — auto-select free model pool",
    isFree: true,
  },
  {
    modelId: "openrouter/auto",
    displayName: "OpenRouter — auto-router (any model)",
    isFree: false,
  },
];

async function fetchJSON(url: string, init: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new AIModelFetchError(
        `Model list request failed: HTTP ${response.status} ${response.statusText} ${text.slice(0, 200)}`,
      );
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchOpenAIModels(credential: DecryptedAICredential): Promise<AIModelInfo[]> {
  const baseUrl = credential.baseUrlOverride?.replace(/\/+$/, "") ?? DIRECT_PROVIDER_BASE_URLS[AIProvider.OPENAI]!;
  const data = await fetchJSON(`${baseUrl}/models`, {
    headers: {
      Authorization: `Bearer ${credential.apiKey}`,
      ...cloudflareGatewayAuthHeaders(baseUrl),
    },
  });
  const list = (data as { data?: Array<{ id?: string; owned_by?: string }> }).data ?? [];
  return list
    .filter((row) => typeof row.id === "string" && row.id.length > 0)
    .map((row) => ({
      modelId: row.id as string,
      displayName: null,
      isFree: false,
      ...knownModelPricing(AIProvider.OPENAI, row.id as string),
      metadata: row,
    }));
}

async function fetchAnthropicModels(credential: DecryptedAICredential): Promise<AIModelInfo[]> {
  const baseUrl = credential.baseUrlOverride?.replace(/\/+$/, "") ?? DIRECT_PROVIDER_BASE_URLS[AIProvider.ANTHROPIC]!;
  const data = await fetchJSON(`${baseUrl}/models`, {
    headers: {
      "x-api-key": credential.apiKey,
      "anthropic-version": "2023-06-01",
      ...cloudflareGatewayAuthHeaders(baseUrl),
    },
  });
  const list = (data as { data?: Array<{ id?: string; display_name?: string }> }).data ?? [];
  return list
    .filter((row) => typeof row.id === "string" && row.id.length > 0)
    .map((row) => ({
      modelId: row.id as string,
      displayName: row.display_name ?? null,
      isFree: false,
      metadata: row,
    }));
}

async function fetchFireworksModels(credential: DecryptedAICredential): Promise<AIModelInfo[]> {
  const baseUrl = credential.baseUrlOverride?.replace(/\/+$/, "") ?? DIRECT_PROVIDER_BASE_URLS[AIProvider.FIREWORKS]!;
  const data = await fetchJSON(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${credential.apiKey}` },
  });
  const list = (data as { data?: Array<{ id?: string }> }).data ?? [];
  return list
    .filter((row) => typeof row.id === "string" && row.id.length > 0)
    .map((row) => ({
      modelId: row.id as string,
      displayName: null,
      isFree: false,
      ...knownModelPricing(AIProvider.FIREWORKS, row.id as string),
      metadata: row,
    }));
}

async function fetchOpenAICompatibleModels(input: {
  provider: AIProvider;
  credential: DecryptedAICredential;
  defaultBaseUrl: string;
}): Promise<AIModelInfo[]> {
  const baseUrl = input.credential.baseUrlOverride?.replace(/\/+$/, "") ?? input.defaultBaseUrl;
  const data = await fetchJSON(`${baseUrl}/models`, {
    headers: {
      Authorization: `Bearer ${input.credential.apiKey}`,
      ...cloudflareGatewayAuthHeaders(baseUrl),
    },
  });
  const list = (data as { data?: Array<{ id?: string; name?: string; owned_by?: string; context_length?: number; context_window?: number; max_context_length?: number }> }).data ?? [];
  return list
    .filter((row) => typeof row.id === "string" && row.id.length > 0)
    .map((row) => ({
      modelId: row.id as string,
      displayName: row.name ?? null,
      isFree: false,
      contextWindow: row.context_length ?? row.context_window ?? row.max_context_length ?? null,
      ...knownModelPricing(input.provider, row.id as string),
      metadata: row,
    }));
}

interface GeminiModelRow {
  name?: string;
  displayName?: string;
  description?: string;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
  supportedGenerationMethods?: string[];
}

async function fetchGeminiModels(credential: DecryptedAICredential): Promise<AIModelInfo[]> {
  const baseUrl = credential.baseUrlOverride?.replace(/\/+$/, "") ?? DIRECT_PROVIDER_BASE_URLS[AIProvider.GEMINI]!;
  const data = await fetchJSON(`${baseUrl}/models`, {
    headers: {
      "x-goog-api-key": credential.apiKey,
      ...cloudflareGatewayAuthHeaders(baseUrl),
    },
  });
  const list = (data as { models?: GeminiModelRow[] }).models ?? [];
  return list
    .filter((row): row is GeminiModelRow & { name: string } => {
      return typeof row.name === "string" &&
        row.name.length > 0 &&
        (row.supportedGenerationMethods ?? []).includes("generateContent");
    })
    .map((row) => ({
      modelId: row.name.replace(/^models\//, ""),
      displayName: row.displayName ?? null,
      isFree: false,
      contextWindow: row.inputTokenLimit ?? null,
      ...knownModelPricing(AIProvider.GEMINI, row.name.replace(/^models\//, "")),
      metadata: row,
    }));
}

interface OpenRouterModelRow {
  id?: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
}

async function fetchOpenRouterModels(credential: DecryptedAICredential | null): Promise<AIModelInfo[]> {
  const baseUrl = credential?.baseUrlOverride?.replace(/\/+$/, "") ?? "https://openrouter.ai/api/v1";
  const headers: Record<string, string> = { Accept: "application/json" };
  if (credential?.apiKey) headers.Authorization = `Bearer ${credential.apiKey}`;
  Object.assign(headers, cloudflareGatewayAuthHeaders(baseUrl));
  const data = await fetchJSON(`${baseUrl}/models`, { headers });
  const list = (data as { data?: OpenRouterModelRow[] }).data ?? [];

  const realModels: AIModelInfo[] = list
    .filter((row): row is OpenRouterModelRow & { id: string } => typeof row.id === "string" && row.id.length > 0)
    .map((row) => {
      const promptPrice = row.pricing?.prompt ? Number(row.pricing.prompt) : NaN;
      const completionPrice = row.pricing?.completion ? Number(row.pricing.completion) : NaN;
      const pricedFree =
        Number.isFinite(promptPrice) && Number.isFinite(completionPrice) &&
        promptPrice === 0 && completionPrice === 0;
      const isFree = isFreeOpenRouterModel(row.id) || pricedFree;
      return {
        modelId: row.id,
        displayName: row.name ?? null,
        isFree,
        contextWindow: typeof row.context_length === "number" ? row.context_length : null,
        inputTokenCostMicros: openRouterUsdPerTokenToMicrosPerThousand(row.pricing?.prompt),
        outputTokenCostMicros: openRouterUsdPerTokenToMicrosPerThousand(row.pricing?.completion),
        metadata: row,
      };
    });

  // Prepend the OpenRouter meta-models so admins always have a "free pool"
  // and "auto router" option available even before the catalogue refreshes.
  return [...OPENROUTER_META_MODELS, ...realModels];
}

export async function fetchModelsFromProvider(input: {
  provider: AIProvider;
  credential?: DecryptedAICredential | null;
}): Promise<AIModelInfo[]> {
  const credential = input.credential ?? null;
  switch (input.provider) {
    case AIProvider.OPENAI:
      if (!credential) throw new AIModelFetchError("OpenAI model list requires a credential");
      return fetchOpenAIModels(credential);
    case AIProvider.ANTHROPIC:
      if (!credential) throw new AIModelFetchError("Anthropic model list requires a credential");
      return fetchAnthropicModels(credential);
    case AIProvider.FIREWORKS:
      if (!credential) throw new AIModelFetchError("Fireworks model list requires a credential");
      return fetchFireworksModels(credential);
    case AIProvider.OPENROUTER:
      // OpenRouter /api/v1/models is public; credential optional.
      return fetchOpenRouterModels(credential);
    case AIProvider.GEMINI:
      if (!credential) throw new AIModelFetchError("Gemini model list requires a credential");
      return fetchGeminiModels(credential);
    case AIProvider.GROQ:
      if (!credential) throw new AIModelFetchError("Groq model list requires a credential");
      return fetchOpenAICompatibleModels({ provider: AIProvider.GROQ, credential, defaultBaseUrl: DIRECT_PROVIDER_BASE_URLS[AIProvider.GROQ]! });
    case AIProvider.MISTRAL:
      if (!credential) throw new AIModelFetchError("Mistral model list requires a credential");
      return fetchOpenAICompatibleModels({ provider: AIProvider.MISTRAL, credential, defaultBaseUrl: DIRECT_PROVIDER_BASE_URLS[AIProvider.MISTRAL]! });
    case AIProvider.CEREBRAS:
      if (!credential) throw new AIModelFetchError("Cerebras model list requires a credential");
      return fetchOpenAICompatibleModels({ provider: AIProvider.CEREBRAS, credential, defaultBaseUrl: DIRECT_PROVIDER_BASE_URLS[AIProvider.CEREBRAS]! });
    case AIProvider.COHERE:
      if (!credential) throw new AIModelFetchError("Cohere model list requires a credential");
      return fetchOpenAICompatibleModels({ provider: AIProvider.COHERE, credential, defaultBaseUrl: DIRECT_PROVIDER_BASE_URLS[AIProvider.COHERE]! });
    default: {
      const _exhaustive: never = input.provider;
      throw new AIModelFetchError(`Unknown provider: ${_exhaustive as string}`);
    }
  }
}

export async function listCachedModels(provider: AIProvider): Promise<CachedAIModel[]> {
  const rows = await db.aIProviderModel.findMany({
    where: { provider },
    orderBy: [{ isFree: "desc" }, { modelId: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    provider: row.provider,
    modelId: row.modelId,
    displayName: row.displayName,
    isFree: row.isFree,
    contextWindow: row.contextWindow,
    inputTokenCostMicros: row.inputTokenCostMicros,
    outputTokenCostMicros: row.outputTokenCostMicros,
    metadata: row.metadata,
    fetchedAt: row.fetchedAt,
  }));
}

export interface RefreshResult {
  provider: AIProvider;
  count: number;
  fetchedAt: Date;
  removed: number;
}

export async function updateCachedModelPricing(input: {
  provider: AIProvider;
  modelId: string;
  inputTokenCostMicros?: number | null;
  outputTokenCostMicros?: number | null;
}) {
  return db.aIProviderModel.update({
    where: { provider_modelId: { provider: input.provider, modelId: input.modelId } },
    data: {
      inputTokenCostMicros: input.inputTokenCostMicros ?? null,
      outputTokenCostMicros: input.outputTokenCostMicros ?? null,
    },
  });
}

export async function refreshModelsForProvider(provider: AIProvider): Promise<RefreshResult> {
  const providerConfigRow = await db.aIProviderConfig.findUnique({ where: { provider } });
  const providerConfig = providerConfigRow ? providerConfigToRouting(providerConfigRow) : null;
  const rawCredential = provider === AIProvider.OPENROUTER
    ? await pickCredentialForProvider({ provider }).catch(() => null)
    : await pickCredentialForProvider({ provider });

  if (provider !== AIProvider.OPENROUTER && !rawCredential) {
    throw new AIModelFetchError(`No active credential available for ${provider}`);
  }

  const baseUrl = resolvedProviderBaseUrl({ credential: rawCredential, providerConfig });
  const credential = rawCredential && baseUrl && !rawCredential.baseUrlOverride
    ? { ...rawCredential, baseUrlOverride: baseUrl }
    : rawCredential;
  const models = await fetchModelsFromProvider({ provider, credential });
  const fetchedAt = new Date();

  const upserts = models.map((model) => {
    const priceUpdate = model.inputTokenCostMicros != null || model.outputTokenCostMicros != null
      ? {
        inputTokenCostMicros: model.inputTokenCostMicros ?? null,
        outputTokenCostMicros: model.outputTokenCostMicros ?? null,
      }
      : {};

    return db.aIProviderModel.upsert({
      where: { provider_modelId: { provider, modelId: model.modelId } },
      create: {
        provider,
        modelId: model.modelId,
        displayName: model.displayName ?? null,
        isFree: model.isFree,
        contextWindow: model.contextWindow ?? null,
        inputTokenCostMicros: model.inputTokenCostMicros ?? null,
        outputTokenCostMicros: model.outputTokenCostMicros ?? null,
        metadata: model.metadata as never,
        fetchedAt,
      },
      update: {
        displayName: model.displayName ?? null,
        isFree: model.isFree,
        contextWindow: model.contextWindow ?? null,
        ...priceUpdate,
        metadata: model.metadata as never,
        fetchedAt,
      },
    });
  });

  await db.$transaction(upserts);

  // Drop entries that disappeared from the provider's catalogue (model retired).
  const liveIds = new Set(models.map((model) => model.modelId));
  const existing = await db.aIProviderModel.findMany({
    where: { provider },
    select: { modelId: true },
  });
  const stale = existing.filter((row) => !liveIds.has(row.modelId)).map((row) => row.modelId);
  let removed = 0;
  if (stale.length > 0) {
    const result = await db.aIProviderModel.deleteMany({
      where: { provider, modelId: { in: stale } },
    });
    removed = result.count;
  }

  log.info("ai-models-refreshed", {
    provider,
    count: models.length,
    removed,
  });

  return { provider, count: models.length, fetchedAt, removed };
}

export function getOpenRouterMetaModels(): AIModelInfo[] {
  return OPENROUTER_META_MODELS;
}
