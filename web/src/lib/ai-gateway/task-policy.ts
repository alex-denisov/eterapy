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

const directPremiumOrder = [
  AIProvider.OPENROUTER,
  AIProvider.GROQ,
  AIProvider.MISTRAL,
  AIProvider.GEMINI,
  AIProvider.CEREBRAS,
  AIProvider.COHERE,
  AIProvider.OPENAI,
  AIProvider.ANTHROPIC,
  AIProvider.FIREWORKS,
] as const;
const cheapStructuredOrder = [
  AIProvider.OPENROUTER,
  AIProvider.GROQ,
  AIProvider.MISTRAL,
  AIProvider.GEMINI,
  AIProvider.CEREBRAS,
  AIProvider.COHERE,
  AIProvider.OPENAI,
  AIProvider.ANTHROPIC,
  AIProvider.FIREWORKS,
] as const;
const freeOrder = [
  AIProvider.OPENROUTER,
  AIProvider.GROQ,
  AIProvider.MISTRAL,
  AIProvider.GEMINI,
  AIProvider.CEREBRAS,
  AIProvider.COHERE,
  AIProvider.OPENAI,
  AIProvider.ANTHROPIC,
  AIProvider.FIREWORKS,
] as const;
const directSensitiveOrder = [
  AIProvider.GEMINI,
  AIProvider.OPENAI,
  AIProvider.ANTHROPIC,
  AIProvider.MISTRAL,
  AIProvider.GROQ,
  AIProvider.COHERE,
  AIProvider.CEREBRAS,
  AIProvider.FIREWORKS,
] as const;
// G7: OCR sends an actual image. Only these providers' configured models can
// read pixels — Gemini Flash, OpenAI gpt-4.1-mini and Anthropic Claude 3 Haiku
// are all multimodal. The other "sensitive" providers (Mistral-small, Groq
// gpt-oss, Cohere command-r, Cerebras/Fireworks gpt-oss) are TEXT-ONLY: routing
// a screenshot to them silently drops the image and returns garbage, which is
// exactly what surfaced to users as "Не удалось распознать скриншот". So the
// vision pipeline must never fall through to a text-only provider.
const directVisionOrder = [
  AIProvider.GEMINI,
  AIProvider.OPENAI,
  AIProvider.ANTHROPIC,
] as const;
const visionModelPreferences: Partial<Record<AIProvider, string>> = {
  [AIProvider.GEMINI]: "gemini-2.5-flash",
  [AIProvider.OPENAI]: "gpt-4.1-mini",
  [AIProvider.ANTHROPIC]: "claude-3-haiku-20240307",
};

const cheapModelPreferences: Record<AIProvider, string> = {
  [AIProvider.OPENROUTER]: "openrouter/free",
  [AIProvider.GROQ]: "llama-3.1-8b-instant",
  [AIProvider.MISTRAL]: "mistral-small-latest",
  [AIProvider.GEMINI]: "gemini-2.5-flash-lite",
  [AIProvider.CEREBRAS]: "gpt-oss-120b",
  [AIProvider.COHERE]: "command-r7b-12-2024",
  [AIProvider.OPENAI]: "gpt-4.1-mini",
  [AIProvider.ANTHROPIC]: "claude-3-5-haiku-20241022",
  [AIProvider.FIREWORKS]: "accounts/fireworks/models/qwen3-30b-a3b",
};

const premiumModelPreferences: Record<AIProvider, string> = {
  [AIProvider.OPENROUTER]: "openrouter/free",
  [AIProvider.GROQ]: "llama-3.3-70b-versatile",
  [AIProvider.MISTRAL]: "mistral-small-latest",
  [AIProvider.GEMINI]: "gemini-2.5-flash",
  [AIProvider.CEREBRAS]: "gpt-oss-120b",
  [AIProvider.COHERE]: "command-r",
  [AIProvider.OPENAI]: "gpt-4.1-mini",
  [AIProvider.ANTHROPIC]: "claude-3-5-haiku-20241022",
  [AIProvider.FIREWORKS]: "accounts/fireworks/models/gpt-oss-120b",
};

const sensitiveModelPreferences: Record<AIProvider, string> = {
  ...premiumModelPreferences,
  [AIProvider.GROQ]: "openai/gpt-oss-safeguard-20b",
  [AIProvider.GEMINI]: "gemini-2.5-flash",
  [AIProvider.OPENAI]: "gpt-4.1-mini",
  [AIProvider.ANTHROPIC]: "claude-3-5-haiku-20241022",
};

function defaultModelPreferencesForTier(tier: AITaskTier): Record<AIProvider, string> {
  if (tier === "free" || tier === "cheap") return cheapModelPreferences;
  if (tier === "sensitive" || tier === "vision" || tier === "speech" || tier === "compliance") return sensitiveModelPreferences;
  return premiumModelPreferences;
}

const DEFAULT_AI_TASK_POLICY_DEFINITIONS: AITaskPolicyDefinition[] = [
  {
    feature: "dialogue-primary-answer",
    enabled: true,
    tier: "free",
    title: "Free первичный разбор",
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
    feature: "daily-practice",
    enabled: true,
    tier: "free",
    title: "Ежедневная практика (день)",
    purpose: "Ежедневная практика: вопрос дня → взгляд дня → маленький шаг. Бесплатный ритуал самонаблюдения.",
    providerOrder: [...freeOrder],
    modelPreferences: { [AIProvider.OPENROUTER]: "openrouter/free" },
    maxTokens: 500,
    temperature: 0.8,
    timeoutMs: 25_000,
    perUserDailyTokenBudget: 4_000,
    fallbackNotes: "Free-тир; при сбое — детерминированный шаблон, чтобы ритуал не ломался.",
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
    providerOrder: [...directSensitiveOrder],
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
    title: "Полная картина",
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
    title: "Подробный разбор",
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
    // G7: vision-only provider order — never route a screenshot to a text-only
    // model, which used to silently fail with "Не удалось распознать скриншот".
    providerOrder: [...directVisionOrder],
    modelPreferences: { ...visionModelPreferences },
    maxTokens: 1600,
    temperature: 0,
    timeoutMs: 45_000,
    // INC-026: NO per-user daily token budget. chat-analysis is a paid, per-use-billed
    // (B408) service that one client legitimately runs many times a day, and an OCR
    // call's REAL tokens (image-dominated) dwarf the 1600 pre-flight estimate — so any
    // daily ceiling (8k, then 40k in B406/INC-020) is spent within the first разбор or
    // two and the next batch fails as «OCR_FAILED» → «(N) скриншотов не распозналось».
    // Every other paid-product feature carries no per-user budget for the same reason;
    // OCR now matches them. Abuse stays bounded by auth + IP rate-limit (15/5 min,
    // batch-aware) + the per-use баллы charge at generate — never a daily token cap.
    fallbackNotes: "Vision-capable providers only (Gemini/OpenAI/Anthropic); image is not persisted after OCR.",
  },
  {
    feature: "product-chat-analysis",
    enabled: true,
    tier: "vision",
    title: "Разбор переписки",
    purpose: "Text/vision pipeline после PII masking и user confirmation.",
    providerOrder: [...directSensitiveOrder],
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
    feature: "product-circle",
    enabled: true,
    tier: "premium",
    title: "Круг",
    purpose: "Групповой рефлексивный формат с consent и безопасными границами.",
    providerOrder: [...directPremiumOrder],
    maxTokens: 2200,
    temperature: 0.4,
    timeoutMs: 55_000,
    fallbackNotes: "Синтезирует только consented input, без раскрытия приватного сверх разрешенного.",
  },
  {
    feature: "product-pair",
    enabled: true,
    tier: "premium",
    title: "Разобраться вдвоем",
    purpose: "Парный разбор с двумя участниками и общим отчетом.",
    providerOrder: [...directPremiumOrder],
    maxTokens: 2400,
    temperature: 0.4,
    timeoutMs: 55_000,
    fallbackNotes: "Не выносит verdict по отношениям; показывает точки разговора и безопасные шаги.",
  },
  {
    feature: "product-symbolic",
    enabled: true,
    tier: "premium",
    title: "Таро, натальная карта, нумерология",
    purpose: "Платные символические продукты без фатальности и с практическим следующим шагом.",
    providerOrder: [...directPremiumOrder],
    maxTokens: 1800,
    temperature: 0.45,
    timeoutMs: 45_000,
    fallbackNotes: "Paid symbolic value uses direct providers; heuristic fallback is visibly marked in metadata.",
  },
  {
    feature: "product-tarot",
    enabled: true,
    tier: "premium",
    title: "Расклад Таро",
    purpose: "Символический paid product как метафора для рефлексии, не предсказание.",
    providerOrder: [...directPremiumOrder],
    maxTokens: 1800,
    temperature: 0.45,
    timeoutMs: 45_000,
    fallbackNotes: "Символический язык переводится в вопрос к себе и практический шаг.",
  },
  {
    feature: "product-natal-chart",
    enabled: true,
    tier: "premium",
    title: "Натальная карта",
    purpose: "Астрологический язык тем без фатальности и без утверждений судьбы.",
    providerOrder: [...directPremiumOrder],
    maxTokens: 1900,
    temperature: 0.45,
    timeoutMs: 45_000,
    fallbackNotes: "Если время рождения неизвестно, модель не утверждает дома/ASC как факт.",
  },
  {
    feature: "product-synastry",
    enabled: true,
    tier: "premium",
    title: "Совместимость по звёздам",
    purpose: "Сравнение двух натальных карт как символического языка динамики пары.",
    providerOrder: [...directPremiumOrder],
    maxTokens: 1900,
    temperature: 0.45,
    timeoutMs: 45_000,
    fallbackNotes: "Не выносит verdict по отношениям; показывает ресурсы, различия и вопросы для разговора.",
  },
  {
    feature: "product-numerology",
    enabled: true,
    tier: "premium",
    title: "Числовой портрет",
    purpose: "Нумерологический язык повторов и личного ритма как метафора.",
    providerOrder: [...directPremiumOrder],
    maxTokens: 1700,
    temperature: 0.45,
    timeoutMs: 45_000,
    fallbackNotes: "Числа интерпретируются бережно, без предсказаний и давления.",
  },
  {
    // B389 (M26): genogram-разбор «Семейные сценарии».
    feature: "product-family-scenarios",
    enabled: true,
    tier: "premium",
    title: "Семейные сценарии",
    purpose: "Genogram-язык повторов рода без фатальности и обвинения семьи.",
    providerOrder: [...directPremiumOrder],
    maxTokens: 1600,
    temperature: 0.45,
    timeoutMs: 45_000,
    fallbackNotes: "Никаких диагнозов рода и приговоров; только повторы и бережный шаг.",
  },
  {
    // B387 (M26): «Дизайн человека» — разбор рассчитанного чарта.
    feature: "product-human-design",
    enabled: true,
    tier: "premium",
    title: "Дизайн человека",
    purpose: "Человеческий разбор рассчитанного типа/стратегии/авторитета/каналов без фатализма.",
    providerOrder: [...directPremiumOrder],
    maxTokens: 1700,
    temperature: 0.45,
    timeoutMs: 45_000,
    fallbackNotes: "Опирается на детерминированно посчитанный чарт; не выдумывает тип и числа.",
  },
  {
    // B391 (M26): «История фамилии» — родовой разбор поверх распознанной формы фамилии.
    feature: "product-surname-story",
    enabled: true,
    tier: "premium",
    title: "История фамилии",
    purpose: "Тёплый родовой разбор по форме фамилии без фатализма и приговоров рода.",
    providerOrder: [...directPremiumOrder],
    maxTokens: 1500,
    temperature: 0.5,
    timeoutMs: 45_000,
    fallbackNotes: "Опирается на распознанную форму фамилии; род — тема для размышления, не судьба.",
  },
  {
    // B386 (M26): чат-компаньон. Короткие реплики (человеческий ритм), премиум-тон.
    feature: "companion-chat",
    enabled: true,
    tier: "premium",
    title: "Чат-компаньон",
    purpose: "Бережный собеседник в человеческом ритме; короткие реплики, предохранители, без раскрытия природы.",
    providerOrder: [...directPremiumOrder],
    maxTokens: 320,
    temperature: 0.6,
    timeoutMs: 45_000,
    fallbackNotes: "Кризис → safety-сообщение и хэндофф; «ты бот?» → мягкий уход; не раскрывает ИИ/живого специалиста.",
  },
  {
    feature: "session-compliance",
    enabled: true,
    tier: "compliance",
    title: "Practitioner compliance review",
    purpose: "Флаги нарушений правил платформы и evidence summary для модератора.",
    providerOrder: [...directSensitiveOrder],
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
    providerOrder: [...directSensitiveOrder],
    maxTokens: 1500,
    temperature: 0.25,
    timeoutMs: 45_000,
    fallbackNotes: "Audio stays outside OpenRouter; summary follows direct provider policy.",
  },
  {
    feature: "session-stt",
    enabled: true,
    tier: "speech",
    title: "Server STT",
    purpose: "Practitioner Pro+ server-side session transcription from temporary LiveKit audio egress.",
    providerOrder: [...directSensitiveOrder],
    maxTokens: 1200,
    temperature: 0,
    timeoutMs: 60_000,
    perUserDailyTokenBudget: 4000,
    fallbackNotes: "One queued job per video session; audio is temporary and deleted after transcription.",
  },
];

export const DEFAULT_AI_TASK_POLICIES: AITaskPolicyDefinition[] = DEFAULT_AI_TASK_POLICY_DEFINITIONS.map((policy) => ({
  ...policy,
  modelPreferences: {
    ...defaultModelPreferencesForTier(policy.tier),
    ...(policy.modelPreferences ?? {}),
  },
}));

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
