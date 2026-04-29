import { AIProvider } from "@prisma/client";
import db from "@/lib/db";
import { log } from "@/lib/logger";
import {
  pickCredentialForProvider,
  type DecryptedAICredential,
} from "@/lib/ai-gateway/credentials";
import { cloudflareGatewayAuthHeaders } from "@/lib/ai-gateway/cloudflare-gateway";
import { isFreeOpenRouterModel } from "@/lib/ai-gateway/openrouter-adapter";

export interface AIModelInfo {
  modelId: string;
  displayName?: string | null;
  isFree: boolean;
  contextWindow?: number | null;
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
  const baseUrl = credential.baseUrlOverride?.replace(/\/+$/, "") ?? "https://api.openai.com/v1";
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
      metadata: row,
    }));
}

async function fetchAnthropicModels(credential: DecryptedAICredential): Promise<AIModelInfo[]> {
  const baseUrl = credential.baseUrlOverride?.replace(/\/+$/, "") ?? "https://api.anthropic.com/v1";
  const data = await fetchJSON(`${baseUrl}/models`, {
    headers: {
      "x-api-key": credential.apiKey,
      "anthropic-version": "2023-06-01",
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
  const baseUrl = credential.baseUrlOverride?.replace(/\/+$/, "") ?? "https://api.fireworks.ai/inference/v1";
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

export async function refreshModelsForProvider(provider: AIProvider): Promise<RefreshResult> {
  const credential = provider === AIProvider.OPENROUTER
    ? await pickCredentialForProvider({ provider }).catch(() => null)
    : await pickCredentialForProvider({ provider });

  if (provider !== AIProvider.OPENROUTER && !credential) {
    throw new AIModelFetchError(`No active credential available for ${provider}`);
  }

  const models = await fetchModelsFromProvider({ provider, credential });
  const fetchedAt = new Date();

  const upserts = models.map((model) =>
    db.aIProviderModel.upsert({
      where: { provider_modelId: { provider, modelId: model.modelId } },
      create: {
        provider,
        modelId: model.modelId,
        displayName: model.displayName ?? null,
        isFree: model.isFree,
        contextWindow: model.contextWindow ?? null,
        metadata: model.metadata as never,
        fetchedAt,
      },
      update: {
        displayName: model.displayName ?? null,
        isFree: model.isFree,
        contextWindow: model.contextWindow ?? null,
        metadata: model.metadata as never,
        fetchedAt,
      },
    }),
  );

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
