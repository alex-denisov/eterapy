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

/**
 * B699 — у Mistral редактор перестал быть автором.
 *
 * Обе роли указывали на `mistral-small-2603`, и в день, когда все остальные
 * провайдеры исчерпали квоты, единственный живой провайдер оказывался
 * непригоден: «в пуле не осталось модели, отличной от модели автора». Модель
 * `mistral-medium-2604` есть в каталоге `ai_provider_models` прода и свежее
 * рубежа 2026-02-28.
 *
 * У Cerebras, Groq и Cohere вторая пригодная модель не проставлена намеренно:
 * в снятом каталоге её нет, а выдуманное имя модели — это 404 в бою. Их
 * одиночество честно объявляется через `marketingProvidersWithSingleModel`.
 */
export const MARKETING_REVIEWER_MODEL_PREFERENCES: Partial<Record<AIProvider, string>> = {
  [AIProvider.OPENROUTER]: "nvidia/nemotron-3-super-120b-a12b:free",
  [AIProvider.GEMINI]: "gemini-3.5-flash",
  [AIProvider.CEREBRAS]: "gemma-4-31b",
  [AIProvider.GROQ]: "qwen/qwen3.6-27b",
  [AIProvider.MISTRAL]: "mistral-medium-2604",
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
  "mistral-medium-2604": "2026-04-21",
  "command-a-plus-05-2026": "2026-05-20",
};

/**
 * B699 — какие модели пул вообще может предъявить, если жив только этот набор
 * провайдеров.
 */
function marketingPoolModels(providers: readonly AIProvider[]): Set<string> {
  const active = new Set<AIProvider>(MARKETING_ACTIVE_PROVIDERS);
  const models = new Set<string>();
  for (const provider of providers) {
    if (!active.has(provider)) continue;
    const writer = MARKETING_WRITER_MODEL_PREFERENCES[provider];
    const reviewer = MARKETING_REVIEWER_MODEL_PREFERENCES[provider];
    if (writer) models.add(writer);
    if (reviewer) models.add(reviewer);
  }
  return models;
}

/**
 * B699 — можно ли вообще развести автора и редактора на разные модели.
 *
 * Отвечает ДО вызова автора. Замер прода 2026-08-09: 88 успешных генераций
 * автора за сутки и ноль публикаций — текст писался, токены списывались, и
 * только потом выяснялось, что независимой модели для проверки нет. Списанные
 * токены при этом уходили с того самого потолка, из-за которого её и не было:
 * нехватка кормила сама себя.
 *
 * Провайдеры вне активного списка не учитываются: платный OpenAI виден в
 * superadmin, но молча создавать платные запросы в контент-плане он не должен
 * (запрет владельца 2026-08-09).
 */
export function marketingPoolCanSeparateRoles(providers: readonly AIProvider[]): boolean {
  return marketingPoolModels(providers).size >= 2;
}

/**
 * B699 — провайдеры, у которых обе роли ходят в одну модель.
 *
 * В одиночку такой провайдер конвейер не тянет, сколько бы ёмкости у него ни
 * было. Список держится явным и под тестом: он сократится тогда, когда у
 * провайдера появится вторая пригодная модель, а не молча.
 */
export function marketingProvidersWithSingleModel(): AIProvider[] {
  return MARKETING_ACTIVE_PROVIDERS.filter(
    (provider) => !marketingPoolCanSeparateRoles([provider]),
  );
}

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
 *
 * B699 — `availableNow` убирает из обхода ключи, про которые в базе УЖЕ
 * записано, что они остывают.
 *
 * Замер прода 2026-08-09 15:27: один проход редактора стучался в groq, cohere,
 * openrouter, gemini и cerebras — все пять с `ALL_PROVIDERS_FAILED` — и лишь
 * шестым доходил до живого Mistral. Каждый стук считался обращением, бюджет
 * материала в 12 обращений (B680) выгорал за два раунда правки, и материал
 * умирал от расхода, а не от собственного качества.
 *
 * Пустой список означает «состояние ключей прочитать не удалось», а не
 * «живых нет»: чтение вспомогательное, и его отказ не должен молча
 * останавливать контур. Тогда обход идёт по всему пулу, как раньше.
 */
export function marketingProviderOrder(
  seed: string,
  excluded: AIProvider[] = [],
  availableNow: readonly AIProvider[] = [],
): AIProvider[] {
  const excludedSet = new Set(excluded);
  const availableSet = new Set(availableNow);
  const available = MARKETING_ACTIVE_PROVIDERS.filter((provider) => {
    if (excludedSet.has(provider)) return false;
    return availableSet.size === 0 || availableSet.has(provider);
  });
  if (available.length < 1) return [];
  const offset = stableSeed(seed) % available.length;
  return [...available.slice(offset), ...available.slice(0, offset)];
}

export function marketingProviderFromLabel(label: string): AIProvider | null {
  const normalized = label.trim().toUpperCase();
  return (MARKETING_FREE_PROVIDERS as readonly AIProvider[]).find((provider) => provider === normalized) ?? null;
}
