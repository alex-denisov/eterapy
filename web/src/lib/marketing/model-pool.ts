import { AIProvider } from "@prisma/client";

/**
 * Providers with an existing connector and a usable free quota/free model.
 * Paid-only providers (including YandexGPT) are deliberately not part of the
 * autonomous marketing pool.
 */
export const MARKETING_FREE_PROVIDERS = [
  AIProvider.OPENROUTER,
  AIProvider.GEMINI,
  AIProvider.CEREBRAS,
  AIProvider.GROQ,
  AIProvider.MISTRAL,
  AIProvider.COHERE,
  AIProvider.OPENAI,
] as const;

/**
 * Providers admitted to unattended generation today. The wider list above is
 * still visible in superadmin, but a connector enters this active list only
 * when it has both a free/trial quota and a model released on or after the
 * rolling freshness boundary. Direct OpenAI API has no free tier, so it
 * remains observable but does not silently create paid requests.
 */
export const MARKETING_ACTIVE_PROVIDERS = [
  AIProvider.OPENROUTER,
  AIProvider.GEMINI,
  AIProvider.CEREBRAS,
  AIProvider.GROQ,
  AIProvider.MISTRAL,
  AIProvider.COHERE,
] as const;

export const MARKETING_MODEL_RELEASE_CUTOFF = "2026-02-28";

export const MARKETING_WRITER_MODEL_PREFERENCES: Partial<Record<AIProvider, string>> = {
  [AIProvider.OPENROUTER]: "google/gemma-4-31b-it:free",
  [AIProvider.GEMINI]: "gemini-3.6-flash",
  [AIProvider.CEREBRAS]: "gemma-4-31b",
  [AIProvider.GROQ]: "qwen/qwen3.6-27b",
  [AIProvider.MISTRAL]: "mistral-small-2603",
  [AIProvider.COHERE]: "command-a-plus-05-2026",
};

export const MARKETING_REVIEWER_MODEL_PREFERENCES: Partial<Record<AIProvider, string>> = {
  [AIProvider.OPENROUTER]: "nvidia/nemotron-3-super-120b-a12b:free",
  [AIProvider.GEMINI]: "gemini-3.5-flash",
  [AIProvider.CEREBRAS]: "gemma-4-31b",
  [AIProvider.GROQ]: "qwen/qwen3.6-27b",
  [AIProvider.MISTRAL]: "mistral-small-2603",
  [AIProvider.COHERE]: "command-a-plus-05-2026",
};

const MARKETING_MODEL_RELEASES: Readonly<Record<string, string>> = {
  "google/gemma-4-31b-it:free": "2026-04-03",
  "nvidia/nemotron-3-super-120b-a12b:free": "2026-03-11",
  "gemini-3.6-flash": "2026-07-21",
  "gemini-3.5-flash": "2026-05-19",
  "gemma-4-31b": "2026-04-03",
  "qwen/qwen3.6-27b": "2026-07-17",
  "mistral-small-2603": "2026-03-16",
  "command-a-plus-05-2026": "2026-05-20",
};

export function marketingModelFreshness(model: string): {
  eligible: boolean;
  releaseDate: string | null;
  reason: string;
} {
  const releaseDate = MARKETING_MODEL_RELEASES[model] ?? null;
  if (!releaseDate) {
    return {
      eligible: false,
      releaseDate,
      reason: `release date is not approved for the marketing pool (cutoff ${MARKETING_MODEL_RELEASE_CUTOFF})`,
    };
  }
  const eligible = releaseDate >= MARKETING_MODEL_RELEASE_CUTOFF;
  return {
    eligible,
    releaseDate,
    reason: eligible
      ? `released ${releaseDate}`
      : `released ${releaseDate}, before cutoff ${MARKETING_MODEL_RELEASE_CUTOFF}`,
  };
}

export function marketingModelPreferences(
  feature: string,
): Partial<Record<AIProvider, string>> {
  if (feature === "marketing-agent-writer" || feature === "marketing-reply-writer") {
    return MARKETING_WRITER_MODEL_PREFERENCES;
  }
  if (feature === "marketing-agent-reviewer" || feature === "marketing-reply-reviewer") {
    return MARKETING_REVIEWER_MODEL_PREFERENCES;
  }
  return {};
}

/**
 * B628 — у разговора отдельный кошелёк.
 *
 * Суточный потолок считается по ключу возможности. Пока плановые публикации и
 * ответы людям тратили ОДИН ключ, всплеск генерации плана закрывал ответы на
 * весь остаток суток: замер прода 2026-07-30 — 603 001 токен за 2,5 часа, после
 * чего ни один ответ написать было нельзя. Разговор нельзя отложить до завтра —
 * человек на другой стороне ждёт сейчас, — поэтому у него собственная ёмкость,
 * которую план не может занять в принципе.
 */
export const MARKETING_REPLY_WRITER_FEATURE = "marketing-reply-writer";
export const MARKETING_REPLY_REVIEWER_FEATURE = "marketing-reply-reviewer";

export const PUBLIC_MARKETING_AI_FEATURES = [
  "marketing-agent-writer",
  "marketing-agent-reviewer",
  MARKETING_REPLY_WRITER_FEATURE,
  MARKETING_REPLY_REVIEWER_FEATURE,
] as const;

export type PublicMarketingAIFeature = typeof PUBLIC_MARKETING_AI_FEATURES[number];

export function isPublicMarketingAIFeature(feature: string): feature is PublicMarketingAIFeature {
  return (PUBLIC_MARKETING_AI_FEATURES as readonly string[]).includes(feature);
}

export function marketingForeignLLMEnabled() {
  return process.env.MARKETING_FOREIGN_LLM_ENABLED === "true";
}

function stableSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Rotate the first-choice provider per material. Fallbacks retain the whole
 * pool, while `excluded` guarantees that reviewer never uses writer's
 * provider.
 */
export function marketingProviderOrder(seed: string, excluded: AIProvider[] = []): AIProvider[] {
  const excludedSet = new Set(excluded);
  const available = MARKETING_ACTIVE_PROVIDERS.filter((provider) => !excludedSet.has(provider));
  if (available.length < 1) return [];
  const offset = stableSeed(seed) % available.length;
  return [...available.slice(offset), ...available.slice(0, offset)];
}

export function marketingProviderFromLabel(label: string): AIProvider | null {
  const normalized = label.trim().toUpperCase();
  return (MARKETING_FREE_PROVIDERS as readonly AIProvider[]).find((provider) => provider === normalized) ?? null;
}
