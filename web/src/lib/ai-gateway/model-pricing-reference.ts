export type AIProviderName =
  | "OPENAI"
  | "ANTHROPIC"
  | "FIREWORKS"
  | "OPENROUTER"
  | "GEMINI"
  | "GROQ"
  | "MISTRAL"
  | "CEREBRAS"
  | "COHERE"
  | "YANDEX";

export type ModelPricingReference = {
  input: number;
  output: number;
  source?: string;
};

export const MODEL_PRICING_REFERENCE_USD_PER_MILLION: Partial<Record<AIProviderName, Record<string, ModelPricingReference>>> = {
  OPENROUTER: {
    "openrouter/free": { input: 0, output: 0, source: "reference/free" },
    "openrouter/auto": { input: 0, output: 0, source: "reference/auto" },
  },
  OPENAI: {
    "gpt-5": { input: 1.25, output: 10 },
    "gpt-5-mini": { input: 0.25, output: 2 },
    "gpt-5-nano": { input: 0.05, output: 0.4 },
    "gpt-4.1": { input: 2, output: 8 },
    "gpt-4.1-mini": { input: 0.4, output: 1.6 },
    "gpt-4.1-nano": { input: 0.1, output: 0.4 },
    "gpt-4o": { input: 2.5, output: 10 },
    "gpt-4o-2024-11-20": { input: 2.5, output: 10 },
    "gpt-4o-2024-08-06": { input: 2.5, output: 10 },
    "gpt-4o-mini": { input: 0.15, output: 0.6 },
    "gpt-4o-mini-2024-07-18": { input: 0.15, output: 0.6 },
    "o3": { input: 2, output: 8 },
    "o3-mini": { input: 1.1, output: 4.4 },
    "o4-mini": { input: 1.1, output: 4.4 },
  },
  ANTHROPIC: {
    "claude-3-haiku-20240307": { input: 0.25, output: 1.25 },
    "claude-3-5-haiku-20241022": { input: 0.8, output: 4 },
    "claude-haiku-4-5": { input: 1, output: 5 },
    "claude-3-5-sonnet-20241022": { input: 3, output: 15 },
    "claude-3-7-sonnet-latest": { input: 3, output: 15 },
    "claude-sonnet-4-5": { input: 3, output: 15 },
    "claude-sonnet-4-5-20250929": { input: 3, output: 15 },
    "claude-opus-4-1": { input: 15, output: 75 },
    "claude-opus-4-5": { input: 5, output: 25 },
  },
  GEMINI: {
    "gemini-1.5-flash": { input: 0.075, output: 0.3 },
    "gemini-2.0-flash": { input: 0.1, output: 0.4 },
    "gemini-2.0-flash-lite": { input: 0.075, output: 0.3 },
    "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
    "gemini-2.5-flash": { input: 0.3, output: 2.5 },
    "gemini-2.5-pro": { input: 1.25, output: 10 },
  },
  GROQ: {
    "llama-3.1-8b-instant": { input: 0.05, output: 0.08 },
    "llama-3.3-70b-versatile": { input: 0.59, output: 0.79 },
    "qwen/qwen3-32b": { input: 0.29, output: 0.59 },
    "openai/gpt-oss-20b": { input: 0.075, output: 0.3 },
    "openai/gpt-oss-120b": { input: 0.15, output: 0.75 },
    "openai/gpt-oss-safeguard-20b": { input: 0.075, output: 0.3 },
    "moonshotai/kimi-k2-instruct": { input: 1, output: 3 },
    "deepseek-r1-distill-llama-70b": { input: 0.75, output: 0.99 },
  },
  MISTRAL: {
    "ministral-3b-latest": { input: 0.04, output: 0.04 },
    "ministral-8b-latest": { input: 0.1, output: 0.1 },
    "mistral-small-latest": { input: 0.1, output: 0.3 },
    "mistral-medium-latest": { input: 0.4, output: 2 },
    "mistral-medium-2505": { input: 0.4, output: 2 },
    "mistral-medium-2508": { input: 0.4, output: 2 },
    "mistral-large-latest": { input: 2, output: 6 },
    "codestral-latest": { input: 0.3, output: 0.9 },
    "pixtral-large-latest": { input: 2, output: 6 },
  },
  COHERE: {
    "command-r7b-12-2024": { input: 0.0375, output: 0.15 },
    "command-r": { input: 0.15, output: 0.6 },
    "command-r-08-2024": { input: 0.15, output: 0.6 },
    "command-a-03-2025": { input: 2.5, output: 10 },
    "command-a-plus-05-2026": { input: 2.5, output: 10 },
    "command-r-plus": { input: 2.5, output: 10 },
  },
  CEREBRAS: {
    "llama-3.1-8b": { input: 0.1, output: 0.1 },
    "llama-3.3-70b": { input: 0.25, output: 0.69 },
    "qwen-3-32b": { input: 0.25, output: 0.69 },
    "gpt-oss-120b": { input: 0.25, output: 0.69 },
    "zai-glm-4.7": { input: 0.25, output: 0.69 },
  },
  FIREWORKS: {
    "accounts/fireworks/models/llama-v3p1-8b-instruct": { input: 0.2, output: 0.2 },
    "accounts/fireworks/models/qwen3-30b-a3b": { input: 0.3, output: 0.3 },
    "accounts/fireworks/models/qwen3-coder-480b-a35b-instruct": { input: 0.9, output: 0.9 },
    "accounts/fireworks/models/gpt-oss-120b": { input: 0.9, output: 0.9 },
    "accounts/fireworks/models/kimi-k2p6": { input: 1.5, output: 6 },
    "accounts/fireworks/models/deepseek-v3": { input: 0.9, output: 0.9 },
  },
};

/**
 * Per-provider fallback reference (USD per million tokens) used when a specific
 * model id is not in the table above. Keeps the admin "Стоимость моделей
 * провайдеров" column populated for every model rather than blank, with a
 * conservative provider-typical estimate the superadmin can override.
 */
export const PROVIDER_FALLBACK_PRICING_USD_PER_MILLION: Partial<Record<AIProviderName, ModelPricingReference>> = {
  OPENAI: { input: 1, output: 4, source: "reference/provider-estimate" },
  ANTHROPIC: { input: 3, output: 15, source: "reference/provider-estimate" },
  GEMINI: { input: 0.3, output: 2.5, source: "reference/provider-estimate" },
  GROQ: { input: 0.3, output: 0.6, source: "reference/provider-estimate" },
  MISTRAL: { input: 0.4, output: 2, source: "reference/provider-estimate" },
  COHERE: { input: 0.15, output: 0.6, source: "reference/provider-estimate" },
  CEREBRAS: { input: 0.25, output: 0.69, source: "reference/provider-estimate" },
  FIREWORKS: { input: 0.9, output: 0.9, source: "reference/provider-estimate" },
  OPENROUTER: { input: 0, output: 0, source: "reference/free" },
};

function normalizeModelId(value: string) {
  return value.trim().replace(/^models\//, "");
}

export function getReferenceModelPricing(provider: AIProviderName, modelId: string): ModelPricingReference | null {
  const normalized = normalizeModelId(modelId);
  const direct = MODEL_PRICING_REFERENCE_USD_PER_MILLION[provider]?.[normalized];
  if (direct) return { ...direct, source: direct.source ?? "reference" };
  if (provider === "OPENROUTER" && normalized.endsWith(":free")) {
    return { input: 0, output: 0, source: "reference/free" };
  }
  // Fall back to a provider-typical estimate so the cost table is never blank.
  const fallback = PROVIDER_FALLBACK_PRICING_USD_PER_MILLION[provider];
  if (fallback) return { ...fallback };
  return null;
}

export function microsPerThousandFromUsdPerMillion(value: number) {
  return Math.round(value * 1000);
}
