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
] as const;

export const PUBLIC_MARKETING_AI_FEATURES = [
  "marketing-agent-writer",
  "marketing-agent-reviewer",
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
  const available = MARKETING_FREE_PROVIDERS.filter((provider) => !excludedSet.has(provider));
  if (available.length < 1) return [];
  const offset = stableSeed(seed) % available.length;
  return [...available.slice(offset), ...available.slice(0, offset)];
}

export function marketingProviderFromLabel(label: string): AIProvider | null {
  const normalized = label.trim().toUpperCase();
  return (MARKETING_FREE_PROVIDERS as readonly AIProvider[]).find((provider) => provider === normalized) ?? null;
}
