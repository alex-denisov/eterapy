import { AIProvider } from "@prisma/client";

export const AI_GATEWAY_PROVIDERS = [
  AIProvider.OPENAI,
  AIProvider.ANTHROPIC,
  AIProvider.FIREWORKS,
  AIProvider.OPENROUTER,
  AIProvider.GEMINI,
  AIProvider.GROQ,
  AIProvider.MISTRAL,
  AIProvider.CEREBRAS,
  AIProvider.COHERE,
  AIProvider.YANDEX,
  // B703 — бесплатные тарифы. Порядок в списке задаёт порядок в суперадминке,
  // поэтому новые идут после проверенных, а не вперемешку.
  AIProvider.KILOCODE,
  AIProvider.NVIDIA,
  AIProvider.OPENCODE_ZEN,
  AIProvider.TOKENROUTER,
  AIProvider.SAMBANOVA,
  AIProvider.POLLINATIONS,
  AIProvider.HUGGINGFACE,
] as const;

export const AI_PROVIDER_LABELS: Record<AIProvider, string> = {
  [AIProvider.OPENAI]: "OpenAI",
  [AIProvider.ANTHROPIC]: "Anthropic",
  [AIProvider.FIREWORKS]: "Fireworks AI",
  [AIProvider.OPENROUTER]: "OpenRouter",
  [AIProvider.GEMINI]: "Google Gemini",
  [AIProvider.GROQ]: "Groq",
  [AIProvider.MISTRAL]: "Mistral AI",
  [AIProvider.CEREBRAS]: "Cerebras",
  [AIProvider.COHERE]: "Cohere",
  [AIProvider.YANDEX]: "Yandex AI Studio",
  [AIProvider.KILOCODE]: "Kilo Code",
  [AIProvider.NVIDIA]: "NVIDIA NIM",
  [AIProvider.OPENCODE_ZEN]: "OpenCode Zen",
  [AIProvider.TOKENROUTER]: "TokenRouter",
  [AIProvider.SAMBANOVA]: "SambaNova Cloud",
  [AIProvider.POLLINATIONS]: "Pollinations",
  [AIProvider.HUGGINGFACE]: "Hugging Face Inference",
};

export type AIGatewayContentBlock =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type AIGatewayMessageContent = string | AIGatewayContentBlock[];

export interface AIGatewayMessage {
  role: "system" | "user" | "assistant";
  content: AIGatewayMessageContent;
}

export interface AIGatewayRequestInput {
  feature: string;
  messages: AIGatewayMessage[];
  userId?: string;
  maxTokens?: number;
  temperature?: number;
  metadata?: Record<string, unknown>;
}

export function normalizeAIFeatureKey(feature: string) {
  return feature
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

export function aiBudgetPeriod(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function defaultProviderOrder(): AIProvider[] {
  return [
    AIProvider.OPENROUTER,
    AIProvider.GEMINI,
    AIProvider.GROQ,
    AIProvider.MISTRAL,
    AIProvider.OPENAI,
    AIProvider.ANTHROPIC,
    AIProvider.COHERE,
    AIProvider.CEREBRAS,
    AIProvider.FIREWORKS,
    AIProvider.YANDEX,
  ];
}
