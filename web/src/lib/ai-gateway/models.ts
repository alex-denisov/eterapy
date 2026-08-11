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
  resolvedProviderBaseUrl,
} from "@/lib/ai-gateway/provider-runtime";
import {
  getReferenceModelPricing,
  microsPerThousandFromUsdPerMillion,
} from "@/lib/ai-gateway/model-pricing-reference";

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

function foreignGatewayBaseUrl(
  provider: Exclude<AIProvider, typeof AIProvider.YANDEX>,
  credential?: DecryptedAICredential | null,
) {
  const baseUrl = resolvedProviderBaseUrl({
    credential: credential ?? { provider, baseUrlOverride: null },
    providerConfig: { provider, baseUrl: null, cloudflareGatewayEnabled: true },
    requireCloudflareAIGateway: true,
  });
  if (!baseUrl) throw new AIModelFetchError(`Cloudflare AI Gateway is not configured for ${provider}`);
  return baseUrl.replace(/\/+$/, "");
}

function openRouterUsdPerTokenToMicrosPerThousand(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 1_000_000_000);
}

function knownModelPricing(provider: AIProvider, modelId: string) {
  const direct = getReferenceModelPricing(provider, modelId);
  if (!direct) return { inputTokenCostMicros: null, outputTokenCostMicros: null };
  return {
    inputTokenCostMicros: microsPerThousandFromUsdPerMillion(direct.input),
    outputTokenCostMicros: microsPerThousandFromUsdPerMillion(direct.output),
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

const YANDEX_TEXT_MODELS: AIModelInfo[] = [
  {
    modelId: "yandexgpt/latest",
    displayName: "YandexGPT Pro",
    isFree: false,
    ...knownModelPricing(AIProvider.YANDEX, "yandexgpt/latest"),
  },
  {
    modelId: "yandexgpt-lite/latest",
    displayName: "YandexGPT Lite",
    isFree: false,
    ...knownModelPricing(AIProvider.YANDEX, "yandexgpt-lite/latest"),
  },
  {
    modelId: "yandex-vision-ocr",
    displayName: "Yandex Vision OCR",
    isFree: false,
    ...knownModelPricing(AIProvider.YANDEX, "yandex-vision-ocr"),
  },
  {
    modelId: "speechkit-stt-async",
    displayName: "Yandex SpeechKit async STT",
    isFree: false,
    ...knownModelPricing(AIProvider.YANDEX, "speechkit-stt-async"),
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
  const baseUrl = foreignGatewayBaseUrl(AIProvider.OPENAI, credential);
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
  const baseUrl = foreignGatewayBaseUrl(AIProvider.ANTHROPIC, credential);
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
  const baseUrl = foreignGatewayBaseUrl(AIProvider.FIREWORKS, credential);
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

/**
 * B703 — цена входа из каталога провайдера. Отсутствие цены — это «каталог
 * молчит», а не «бесплатно»: молчание не должно попадать в сводку как факт.
 */
function catalogRowIsFree(prompt: string | number | undefined): boolean {
  if (prompt === undefined || prompt === null) return false;
  const parsed = typeof prompt === "number" ? prompt : Number(prompt);
  return Number.isFinite(parsed) && parsed === 0;
}

async function fetchOpenAICompatibleModels(input: {
  provider: AIProvider;
  credential: DecryptedAICredential;
}): Promise<AIModelInfo[]> {
  if (input.provider === AIProvider.YANDEX) {
    throw new AIModelFetchError("Yandex is not an OpenAI-compatible foreign provider");
  }
  const baseUrl = foreignGatewayBaseUrl(input.provider, input.credential);
  const data = await fetchJSON(`${baseUrl}/models`, {
    headers: {
      Authorization: `Bearer ${input.credential.apiKey}`,
      ...cloudflareGatewayAuthHeaders(baseUrl),
    },
  });
  const list = (data as {
    data?: Array<{
      id?: string;
      name?: string;
      owned_by?: string;
      context_length?: number;
      context_window?: number;
      max_context_length?: number;
      pricing?: { prompt?: string | number };
    }>;
  }).data ?? [];
  return list
    .filter((row) => typeof row.id === "string" && row.id.length > 0)
    .map((row) => ({
      modelId: row.id as string,
      displayName: row.name ?? null,
      // B703 — «бесплатна» говорит КАТАЛОГ провайдера, а не наша таблица цен.
      // У новых коннекторов цена по умолчанию нулевая (аккаунт без баланса
      // ходит только в бесплатный тариф), и вывести признак из неё значило бы
      // объявить бесплатными все 352 модели Kilo, включая те, что отвечают
      // `402 «Add credits»`. Каталоги OpenRouter-формы отдают цену строкой.
      isFree: catalogRowIsFree(row.pricing?.prompt),
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
  const baseUrl = foreignGatewayBaseUrl(AIProvider.GEMINI, credential);
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
  const baseUrl = foreignGatewayBaseUrl(AIProvider.OPENROUTER, credential);
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

async function fetchCohereModels(credential: DecryptedAICredential): Promise<AIModelInfo[]> {
  const baseUrl = foreignGatewayBaseUrl(AIProvider.COHERE, credential);
  const data = await fetchJSON(`${baseUrl}/v1/models`, {
    headers: {
      Authorization: `Bearer ${credential.apiKey}`,
      ...cloudflareGatewayAuthHeaders(baseUrl),
    },
  });
  const list = (data as {
    models?: Array<{ name?: string; endpoints?: string[]; context_length?: number }>;
  }).models ?? [];
  return list
    .filter((row) => typeof row.name === "string" && row.name.length > 0)
    .map((row) => ({
      modelId: row.name as string,
      displayName: row.name ?? null,
      isFree: false,
      contextWindow: row.context_length ?? null,
      ...knownModelPricing(AIProvider.COHERE, row.name as string),
      metadata: row,
    }));
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
      return fetchOpenAICompatibleModels({ provider: AIProvider.GROQ, credential });
    case AIProvider.MISTRAL:
      if (!credential) throw new AIModelFetchError("Mistral model list requires a credential");
      return fetchOpenAICompatibleModels({ provider: AIProvider.MISTRAL, credential });
    case AIProvider.CEREBRAS:
      if (!credential) throw new AIModelFetchError("Cerebras model list requires a credential");
      return fetchOpenAICompatibleModels({ provider: AIProvider.CEREBRAS, credential });
    case AIProvider.COHERE:
      if (!credential) throw new AIModelFetchError("Cohere model list requires a credential");
      return fetchCohereModels(credential);
    case AIProvider.YANDEX:
      if (!credential) throw new AIModelFetchError("Yandex model list requires a credential");
      return YANDEX_TEXT_MODELS;
    // B703 — у всех семи каталог лежит по `GET /models` в форме OpenAI:
    // проверено живым вызовом каждого. Kilo отдаёт `data[]` без обёртки
    // `object: "list"`, и разборщик это переживает — он смотрит только на `data`.
    case AIProvider.KILOCODE:
    case AIProvider.NVIDIA:
    case AIProvider.OPENCODE_ZEN:
    case AIProvider.TOKENROUTER:
    case AIProvider.SAMBANOVA:
    case AIProvider.POLLINATIONS:
    case AIProvider.HUGGINGFACE:
      if (!credential) {
        throw new AIModelFetchError(`${input.provider} model list requires a credential`);
      }
      return fetchOpenAICompatibleModels({ provider: input.provider, credential });
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
  const reference = getReferenceModelPricing(input.provider, input.modelId);
  return db.aIProviderModel.upsert({
    where: { provider_modelId: { provider: input.provider, modelId: input.modelId } },
    create: {
      provider: input.provider,
      modelId: input.modelId,
      displayName: reference ? "Reference price" : null,
      isFree: reference?.input === 0 && reference.output === 0,
      inputTokenCostMicros: input.inputTokenCostMicros ?? null,
      outputTokenCostMicros: input.outputTokenCostMicros ?? null,
      ...(reference ? { metadata: { pricingSource: reference.source ?? "reference" } } : {}),
      fetchedAt: new Date(),
    },
    update: {
      inputTokenCostMicros: input.inputTokenCostMicros ?? null,
      outputTokenCostMicros: input.outputTokenCostMicros ?? null,
    },
  });
}

export async function refreshModelsForProvider(provider: AIProvider): Promise<RefreshResult> {
  const rawCredential = provider === AIProvider.OPENROUTER
    ? await pickCredentialForProvider({ provider }).catch(() => null)
    : await pickCredentialForProvider({ provider });

  if (provider !== AIProvider.OPENROUTER && !rawCredential) {
    throw new AIModelFetchError(`No active credential available for ${provider}`);
  }

  const models = await fetchModelsFromProvider({ provider, credential: rawCredential });
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
