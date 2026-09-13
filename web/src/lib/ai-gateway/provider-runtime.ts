import { AIProvider, type AIProviderConfig } from "@prisma/client";
import type { AIGatewayAdapter } from "@/lib/ai-gateway/adapters";
import { createAnthropicAdapter } from "@/lib/ai-gateway/anthropic-adapter";
import {
  buildCloudflareGatewayUrlForAIProvider,
  getCloudflareGatewayConfig,
  isCloudflareAIGatewayUrl,
} from "@/lib/ai-gateway/cloudflare-gateway";
import { createCohereAdapter } from "@/lib/ai-gateway/cohere-adapter";
import { AI_PROVIDER_LABELS } from "@/lib/ai-gateway/domain";
import {
  preferredGatewayForProvider,
  type AIGatewayKind,
} from "@/lib/ai-gateway/edge-model-gateway";
import type { DecryptedAICredential } from "@/lib/ai-gateway/credentials";
import { createFireworksAdapter } from "@/lib/ai-gateway/fireworks-adapter";
import { createGeminiAdapter } from "@/lib/ai-gateway/gemini-adapter";
import { createVertexAdapter, credentialUsesVertex } from "@/lib/ai-gateway/vertex-adapter";
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
  // B634: у Cohere адаптер дописывает ПОЛНЫЙ родной путь `/v2/chat`, поэтому
  // база у него — корень хоста, без `/compatibility/v1`. Прежнее значение
  // сходилось только со шлюзом Cloudflare (у того база без пути), а прямой
  // вызов дал бы `…/compatibility/v1/v2/chat` и 404. Расхождение было
  // незаметным ровно до тех пор, пока Cohere ходил только через Cloudflare.
  [AIProvider.COHERE]: "https://api.cohere.com",
  [AIProvider.YANDEX]: YANDEX_FOUNDATION_MODELS_BASE_URL,
  // B703 — адреса сняты живой пробой боевых ключей 2026-08-11, а не выведены
  // из имени переменной окружения. Два из семи оказались другими:
  //  • `kilocode.ai` отвечает 308 и переносит на `kilo.ai/api/openrouter`.
  //    Держать здесь адрес с редиректом означало бы редирект на каждый вызов
  //    модели, а `POST` через редирект теряет тело у части клиентов;
  //  • `api.tokenrouter.io` живой, но ждёт ключ формата `tr_…` и на наш `sk-…`
  //    отвечает `401`. Это выглядит как «ключ протух», хотя ключ верный —
  //    просто адрес чужой. Рабочий хост — `api.tokenrouter.com`.
  [AIProvider.KILOCODE]: "https://kilo.ai/api/openrouter",
  [AIProvider.NVIDIA]: "https://integrate.api.nvidia.com/v1",
  [AIProvider.OPENCODE_ZEN]: "https://opencode.ai/zen/v1",
  [AIProvider.TOKENROUTER]: "https://api.tokenrouter.com/v1",
  [AIProvider.SAMBANOVA]: "https://api.sambanova.ai/v1",
  [AIProvider.POLLINATIONS]: "https://text.pollinations.ai/openai",
  [AIProvider.HUGGINGFACE]: "https://router.huggingface.co/v1",
};

/**
 * B703 — коннекторы, у которых аккаунт без баланса.
 *
 * Список существует, чтобы «бесплатный тариф» был свойством кода, а не устной
 * договорённостью. Модель по умолчанию у каждого — та, которая ОТВЕТИЛА при
 * нулевом балансе: у Kilo платная модель даёт `402 «Add credits»`, у
 * TokenRouter `403 «insufficient user quota, $0.00»`, у SambaNova `402`.
 * Подставить сюда сильную платную модель значило бы завести коннектор, который
 * в бою не отвечает никогда.
 */
export const FREE_TIER_LLM_PROVIDERS = [
  AIProvider.KILOCODE,
  AIProvider.NVIDIA,
  AIProvider.OPENCODE_ZEN,
  AIProvider.TOKENROUTER,
  AIProvider.SAMBANOVA,
  AIProvider.POLLINATIONS,
  AIProvider.HUGGINGFACE,
] as const;

export function isFreeTierLLMProvider(provider: AIProvider): boolean {
  return (FREE_TIER_LLM_PROVIDERS as readonly AIProvider[]).includes(provider);
}

export const DEFAULT_PROVIDER_MODELS: Record<AIProvider, string> = {
  [AIProvider.OPENAI]: "gpt-5.6-luna",
  [AIProvider.ANTHROPIC]: "claude-3-5-haiku-20241022",
  [AIProvider.FIREWORKS]: "accounts/fireworks/models/gpt-oss-120b",
  [AIProvider.OPENROUTER]: "openrouter/free",
  [AIProvider.GEMINI]: "gemini-3.6-flash",
  [AIProvider.GROQ]: "qwen/qwen3.6-27b",
  [AIProvider.MISTRAL]: "mistral-small-2603",
  [AIProvider.CEREBRAS]: "gpt-oss-120b",
  [AIProvider.COHERE]: "command-a-plus-05-2026",
  [AIProvider.YANDEX]: DEFAULT_YANDEX_MODEL,
  // B703 — каждая проверена вызовом `POST /chat/completions` боевым ключом.
  [AIProvider.KILOCODE]: "nvidia/nemotron-3.5-lightning:free",
  [AIProvider.NVIDIA]: "nvidia/nemotron-3-super-120b-a12b",
  [AIProvider.OPENCODE_ZEN]: "deepseek-v4-flash-free",
  [AIProvider.TOKENROUTER]: "moonshotai/kimi-k3-free",
  [AIProvider.SAMBANOVA]: "gemma-4-31B-it",
  [AIProvider.POLLINATIONS]: "openai-fast",
  [AIProvider.HUGGINGFACE]: "prism-ml/Ternary-Bonsai-27B-AWQ-4bit",
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

/**
 * B634 — единственное место, где решается «через какой шлюз идёт провайдер».
 *
 * И выбор адреса, и маршрутное доказательство спрашивают именно её: если бы
 * доказательство считалось отдельно, оно однажды разошлось бы с фактическим
 * маршрутом — а это ровно то поле, по которому судят о трансграничном контроле.
 */
export function controlledGatewayUrlForProvider(
  provider: AIProvider,
): { kind: AIGatewayKind; url: string | null } {
  if (provider === AIProvider.YANDEX) return { kind: "none", url: null };
  const gateway = getCloudflareGatewayConfig();
  return preferredGatewayForProvider({
    provider,
    directBaseUrl: DIRECT_PROVIDER_BASE_URLS[provider],
    cloudflareUrl: gateway
      ? buildCloudflareGatewayUrlForAIProvider({
        accountId: gateway.accountId,
        gatewayId: gateway.gatewayId,
        provider,
      })
      : null,
  });
}

export function resolvedProviderBaseUrl(input: {
  credential?: Pick<DecryptedAICredential, "baseUrlOverride">
    & Partial<Pick<DecryptedAICredential, "provider">> | null;
  providerConfig?: Pick<AIRoutingProviderConfig, "provider" | "baseUrl" | "cloudflareGatewayEnabled"> | null;
  /**
   * A narrow fail-closed route for public workloads that are explicitly
   * allowed to use foreign providers. It bypasses the RU user-data toggle,
   * but never bypasses a controlled gateway itself.
   *
   * B634: «контролируемый шлюз» — это наша зарубежная нода, а если её нет —
   * Cloudflare. Раньше здесь безусловно строился адрес Cloudflare, и это
   * оставляло четырёх провайдеров мёртвыми по стране (замер B633).
   */
  requireCloudflareAIGateway?: boolean;
}) {
  const provider = input.providerConfig?.provider ?? input.credential?.provider;
  if (input.requireCloudflareAIGateway) {
    if (!provider || provider === AIProvider.YANDEX) {
      throw new Error("A controlled AI gateway is required only for a supported foreign provider");
    }
    const gatewayUrl = controlledGatewayUrlForProvider(provider).url;
    if (!gatewayUrl) {
      throw new Error(`No controlled AI gateway is configured for ${provider}`);
    }
    return gatewayUrl;
  }

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
    // B634: «включён шлюз» означает контролируемый шлюз, а не имя вендора.
    // Оператор, поставивший галочку, хотел не Cloudflare как таковой, а чтобы
    // вызов не шёл с российского выхода напрямую.
    const gatewayUrl = controlledGatewayUrlForProvider(config.provider).url;
    if (gatewayUrl) return gatewayUrl;
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
  options?: { requireCloudflareAIGateway?: boolean },
): AIGatewayAdapter {
  const baseURL = resolvedProviderBaseUrl({
    credential,
    providerConfig,
    // Owner policy: every foreign connector is fail-closed behind Cloudflare,
    // not only the public-marketing exception. Yandex remains direct.
    requireCloudflareAIGateway: credential.provider === AIProvider.YANDEX
      ? false
      : (options?.requireCloudflareAIGateway ?? true),
  });
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
    case AIProvider.GEMINI: {
      /**
       * B742 — КЛЮЧ САМ ГОВОРИТ, ЧЕРЕЗ КАКУЮ ДВЕРЬ ИДТИ.
       *
       * Обычный ключ AI Studio — строка `AIza…`; ключ Vertex — JSON сервисного
       * аккаунта Google Cloud. Различить их можно без второй настройки, и это
       * важнее, чем кажется: настройка, которую надо не забыть выставить рядом
       * с ключом, однажды не выставляется, и маршрут молча уходит не туда.
       *
       * Смысл маршрута для владельца — кошелёк: бонусные $300 Google Cloud на
       * Gemini API в AI Studio не распространяются и покрывают Vertex.
       */
      if (credentialUsesVertex(credential.apiKey)) {
        return createVertexAdapter({
          serviceAccountJson: credential.apiKey,
          // Регион приезжает окружением: у Vertex он часть адреса, а не
          // свойство ключа, и меняется без перевыпуска аккаунта.
          ...(process.env.VERTEX_LOCATION?.trim() ? { location: process.env.VERTEX_LOCATION.trim() } : {}),
          // Через шлюз Vertex ходит по своему пути — общий адрес AI Studio
          // ему не подходит, поэтому берём только явный override.
          ...(credential.baseUrlOverride ? { baseURL: credential.baseUrlOverride } : {}),
          ...(opts.defaultModel ? { defaultModel: opts.defaultModel } : {}),
          ...(providerConfig?.timeoutMs ? { timeoutMs: providerConfig.timeoutMs } : {}),
        });
      }
      return createGeminiAdapter(opts);
    }
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
      return createCohereAdapter({
        ...opts,
        baseURL: opts.baseURL ?? DIRECT_PROVIDER_BASE_URLS[AIProvider.COHERE]!,
        defaultModel: opts.defaultModel ?? DEFAULT_PROVIDER_MODELS[AIProvider.COHERE],
      });
    // B703 — все семь бесплатных коннекторов отвечают в форме OpenAI: у
    // каждого проверен живой `POST /chat/completions`. Отдельных веток они не
    // получают намеренно — различие между ними исчерпывается адресом и
    // моделью, а обе величины уже лежат в таблицах выше. Семь копий одной
    // ветки означали бы семь мест, где однажды поправят шесть.
    case AIProvider.KILOCODE:
    case AIProvider.NVIDIA:
    case AIProvider.OPENCODE_ZEN:
    case AIProvider.TOKENROUTER:
    case AIProvider.SAMBANOVA:
    case AIProvider.POLLINATIONS:
    case AIProvider.HUGGINGFACE: {
      const label = AI_PROVIDER_LABELS[credential.provider];
      return createOpenAICompatibleAdapter({
        ...opts,
        provider: credential.provider,
        providerSlug: label,
        missingConfigMessage: `${label} API key is not configured`,
        baseURL: opts.baseURL ?? DIRECT_PROVIDER_BASE_URLS[credential.provider]!,
        defaultModel: opts.defaultModel ?? DEFAULT_PROVIDER_MODELS[credential.provider],
      });
    }
  }
}

/**
 * Машинное имя провайдера в ответе шлюза.
 *
 * B703 — раньше здесь была цепочка `if` с хвостом `return "fireworks"`, и
 * любой провайдер, забытый в цепочке, представлялся Fireworks. Семь новых
 * коннекторов молча превратились бы в него же — а по этому полю судят, кто
 * именно написал материал. Таблица не даёт забыть: `Record<AIProvider, …>`
 * без нового значения не собирается.
 */
export const AI_PROVIDER_MACHINE_LABELS = {
  [AIProvider.OPENROUTER]: "openrouter",
  [AIProvider.OPENAI]: "openai",
  [AIProvider.ANTHROPIC]: "anthropic",
  [AIProvider.FIREWORKS]: "fireworks",
  [AIProvider.GEMINI]: "gemini",
  [AIProvider.GROQ]: "groq",
  [AIProvider.MISTRAL]: "mistral",
  [AIProvider.CEREBRAS]: "cerebras",
  [AIProvider.COHERE]: "cohere",
  [AIProvider.YANDEX]: "yandex",
  [AIProvider.KILOCODE]: "kilocode",
  [AIProvider.NVIDIA]: "nvidia",
  [AIProvider.OPENCODE_ZEN]: "opencode-zen",
  [AIProvider.TOKENROUTER]: "tokenrouter",
  [AIProvider.SAMBANOVA]: "sambanova",
  [AIProvider.POLLINATIONS]: "pollinations",
  [AIProvider.HUGGINGFACE]: "huggingface",
} as const satisfies Record<AIProvider, string>;

export type AIProviderMachineLabel = typeof AI_PROVIDER_MACHINE_LABELS[AIProvider];

export function providerLabel(provider: AIProvider): AIProviderMachineLabel {
  return AI_PROVIDER_MACHINE_LABELS[provider];
}
