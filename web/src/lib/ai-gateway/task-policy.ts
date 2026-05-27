import { AIProvider, type AIRoutingPolicy } from "@prisma/client";
import { normalizeAIFeatureKey } from "@/lib/ai-gateway/domain";
import type { AIRoutingPolicyConfig } from "@/lib/ai-gateway/routing";

export type AITaskTier = "free" | "cheap" | "premium" | "sensitive" | "vision" | "speech" | "compliance";

export interface AITaskPolicyDefinition extends AIRoutingPolicyConfig {
  tier: AITaskTier;
  title: string;
  purpose: string;
  fallbackNotes: string;
}

export type AdminAITaskPolicy = AITaskPolicyDefinition & {
  source: "default" | "database";
};

const directPremiumOrder = [AIProvider.OPENAI, AIProvider.GEMINI, AIProvider.ANTHROPIC] as const;
const cheapStructuredOrder = [AIProvider.GEMINI, AIProvider.OPENAI, AIProvider.ANTHROPIC, AIProvider.OPENROUTER] as const;
const freeOrder = [AIProvider.OPENROUTER, AIProvider.GEMINI, AIProvider.FIREWORKS, AIProvider.OPENAI] as const;

export const DEFAULT_AI_TASK_POLICIES: AITaskPolicyDefinition[] = [
  {
    feature: "dialogue-primary-answer",
    enabled: true,
    tier: "free",
    title: "Free Диалог ясности",
    purpose: "Бесплатный вход: короткий первичный разбор и мягкий следующий шаг.",
    providerOrder: [...freeOrder],
    modelPreferences: { [AIProvider.OPENROUTER]: "openrouter/free" },
    maxTokens: 900,
    temperature: 0.45,
    timeoutMs: 30_000,
    perUserDailyTokenBudget: 12_000,
    fallbackNotes: "OpenRouter/free для объема; direct OpenAI только как резерв.",
  },
  {
    feature: "dialogue-clarifier",
    enabled: true,
    tier: "cheap",
    title: "Уточняющие вопросы",
    purpose: "Персональные уточнения перед первичным ответом — один вопрос за ход.",
    providerOrder: [...cheapStructuredOrder],
    modelPreferences: { [AIProvider.OPENROUTER]: "meta-llama/llama-3.1-8b-instruct:free" },
    maxTokens: 400,
    temperature: 0.6,
    timeoutMs: 25_000,
    perUserDailyTokenBudget: 8_000,
    fallbackNotes: "OPENAI/ANTHROPIC первые; OpenRouter llama-3.1-8b как резерв для JSON.",
  },
  {
    feature: "dialogue-router",
    enabled: true,
    tier: "cheap",
    title: "Routing / triage",
    purpose: "JSON-классификация намерения, сложности и дальнейшего продукта.",
    providerOrder: [...cheapStructuredOrder],
    maxTokens: 350,
    temperature: 0,
    timeoutMs: 20_000,
    perUserDailyTokenBudget: 4_000,
    fallbackNotes: "Structured direct mini/haiku first; OpenRouter only for low-risk fallback.",
  },
  {
    feature: "safety-classification",
    enabled: true,
    tier: "sensitive",
    title: "Sensitive / crisis triage",
    purpose: "Кризис, жалобы, безопасность и ограничения ответа.",
    providerOrder: [...directPremiumOrder],
    maxTokens: 450,
    temperature: 0,
    timeoutMs: 25_000,
    perUserDailyTokenBudget: 6_000,
    fallbackNotes: "No OpenRouter: direct providers and human review boundary for high risk.",
  },
  {
    feature: "product-perspectives",
    enabled: true,
    tier: "premium",
    title: "4 ракурса",
    purpose: "Платный быстрый unlock после первичного разбора.",
    providerOrder: [...directPremiumOrder],
    maxTokens: 1800,
    temperature: 0.45,
    timeoutMs: 45_000,
    fallbackNotes: "Paid value uses direct premium provider, Anthropic as fallback.",
  },
  {
    feature: "product-deep-report",
    enabled: true,
    tier: "premium",
    title: "Глубокий отчет",
    purpose: "Основной платный синтез с высоким доверием.",
    providerOrder: [...directPremiumOrder],
    maxTokens: 3200,
    temperature: 0.45,
    timeoutMs: 60_000,
    fallbackNotes: "No free models for long paid synthesis.",
  },
  {
    feature: "product-chat-analysis-ocr",
    enabled: true,
    tier: "vision",
    title: "OCR переписки",
    purpose: "Vision/OCR extraction из скриншота перед пользовательским подтверждением и PII masking.",
    providerOrder: [...directPremiumOrder],
    modelPreferences: { [AIProvider.OPENAI]: "gpt-4.1-mini" },
    maxTokens: 1600,
    temperature: 0,
    timeoutMs: 45_000,
    perUserDailyTokenBudget: 8_000,
    fallbackNotes: "No OpenRouter/free: screenshots stay on direct providers; image is not persisted after OCR.",
  },
  {
    feature: "product-chat-analysis",
    enabled: true,
    tier: "vision",
    title: "Разбор переписки",
    purpose: "Text/vision pipeline после PII masking и user confirmation.",
    providerOrder: [...directPremiumOrder],
    maxTokens: 2600,
    temperature: 0.3,
    timeoutMs: 60_000,
    fallbackNotes: "Vision/sensitive content stays on direct providers; OCR confirmation required upstream.",
  },
  {
    feature: "product-compatibility",
    enabled: true,
    tier: "premium",
    title: "Разобраться вдвоем / совместимость",
    purpose: "Сравнение двух позиций и общий отчет после consent.",
    providerOrder: [...directPremiumOrder],
    maxTokens: 2600,
    temperature: 0.4,
    timeoutMs: 55_000,
    fallbackNotes: "Paid multiplayer synthesis uses direct providers only.",
  },
  {
    feature: "product-seven-days-report",
    enabled: true,
    tier: "premium",
    title: "7 дней итог",
    purpose: "Итоговый недельный отчет по практике.",
    providerOrder: [...directPremiumOrder],
    maxTokens: 2400,
    temperature: 0.45,
    timeoutMs: 55_000,
    fallbackNotes: "Daily free can be cheap; final report is premium.",
  },
  {
    feature: "product-symbolic",
    enabled: true,
    tier: "premium",
    title: "Таро, натальная карта, нумерология, расширенная карта",
    purpose: "Платные символические продукты без фатальности и с практическим следующим шагом.",
    providerOrder: [...directPremiumOrder],
    maxTokens: 1800,
    temperature: 0.45,
    timeoutMs: 45_000,
    fallbackNotes: "Paid symbolic value uses direct providers; heuristic fallback is visibly marked in metadata.",
  },
  {
    feature: "session-compliance",
    enabled: true,
    tier: "compliance",
    title: "Practitioner compliance review",
    purpose: "Флаги нарушений правил платформы и evidence summary для модератора.",
    providerOrder: [...directPremiumOrder],
    maxTokens: 700,
    temperature: 0,
    timeoutMs: 35_000,
    fallbackNotes: "No auto-ban; LLM creates risk flag, final decision is human.",
  },
  {
    feature: "session-summary",
    enabled: true,
    tier: "speech",
    title: "Practitioner Pro session summary",
    purpose: "Саммари встречи после STT/diarization.",
    providerOrder: [...directPremiumOrder],
    maxTokens: 1500,
    temperature: 0.25,
    timeoutMs: 45_000,
    fallbackNotes: "Audio stays outside OpenRouter; summary follows direct provider policy.",
  },
];

const defaultPolicyByFeature = new Map(
  DEFAULT_AI_TASK_POLICIES.flatMap((policy) => {
    const normalized = normalizeAIFeatureKey(policy.feature);
    return [
      [normalized, policy] as const,
      [normalized.replaceAll("-", "_"), policy] as const,
    ];
  })
);

export function getDefaultAIRoutingPolicy(feature: string): AITaskPolicyDefinition | null {
  return defaultPolicyByFeature.get(normalizeAIFeatureKey(feature)) ?? null;
}

export function listDefaultAITaskPolicies(): AITaskPolicyDefinition[] {
  return DEFAULT_AI_TASK_POLICIES;
}

export function mergeAITaskPolicies(rows: AIRoutingPolicy[]): AdminAITaskPolicy[] {
  const byFeature = new Map(rows.map((row) => [normalizeAIFeatureKey(row.feature), row]));

  const defaults = DEFAULT_AI_TASK_POLICIES.map((definition): AdminAITaskPolicy => {
    const row = byFeature.get(normalizeAIFeatureKey(definition.feature));
    if (!row) return { ...definition, source: "default" };
    return {
      ...definition,
      feature: row.feature,
      enabled: row.enabled,
      providerOrder: row.providerOrder,
      modelPreferences: row.modelPreferences,
      maxTokens: row.maxTokens,
      temperature: row.temperature,
      timeoutMs: row.timeoutMs,
      dailyTokenBudget: row.dailyTokenBudget,
      perUserDailyTokenBudget: row.perUserDailyTokenBudget,
      source: "database",
    };
  });

  const known = new Set(defaults.map((policy) => normalizeAIFeatureKey(policy.feature)));
  const custom = rows
    .filter((row) => !known.has(normalizeAIFeatureKey(row.feature)))
    .map((row): AdminAITaskPolicy => ({
      feature: row.feature,
      enabled: row.enabled,
      providerOrder: row.providerOrder,
      modelPreferences: row.modelPreferences,
      maxTokens: row.maxTokens,
      temperature: row.temperature,
      timeoutMs: row.timeoutMs,
      dailyTokenBudget: row.dailyTokenBudget,
      perUserDailyTokenBudget: row.perUserDailyTokenBudget,
      tier: "cheap",
      title: row.feature,
      purpose: "Пользовательская политика маршрутизации.",
      fallbackNotes: "Проверьте, что порядок провайдеров соответствует типу данных.",
      source: "database",
    }));

  return [...defaults, ...custom].sort((a, b) => a.feature.localeCompare(b.feature));
}
