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
  // B703 — семь коннекторов на бесплатных тарифах. Список важен не только
  // как «что видно в суперадминке»: трансграничный гейт пускает публичный
  // SMM-контур ровно по нему (`cross-border-gate.ts`), и провайдер вне списка
  // получит отказ политики, а не отказ модели.
  AIProvider.KILOCODE,
  AIProvider.NVIDIA,
  AIProvider.OPENCODE_ZEN,
  AIProvider.TOKENROUTER,
  AIProvider.SAMBANOVA,
  AIProvider.HUGGINGFACE,
  AIProvider.POLLINATIONS,
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
  // B703 — шесть из семи новых коннекторов. Pollinations в активный список НЕ
  // входит: на его бесплатном тарифе одна модель, gpt-oss-20b от 2025-08-05,
  // то есть старше рубежа свежести на полгода. Придумать ему свежее имя
  // модели значило бы получить 404 в бою — ровно та ошибка, от которой
  // предостерегает комментарий у предпочтений редактора ниже.
  AIProvider.KILOCODE,
  AIProvider.NVIDIA,
  AIProvider.OPENCODE_ZEN,
  AIProvider.TOKENROUTER,
  AIProvider.SAMBANOVA,
  AIProvider.HUGGINGFACE,
] as const;

export const MARKETING_MODEL_RELEASE_CUTOFF = "2026-02-28";

/**
 * B713 §7 — СИЛЬНАЯ МОДЕЛЬ ДОСТАЁТСЯ ТОМУ, КТО ПИШЕТ.
 *
 * Замер прода 14.08 → 17.08 (`ai_attempts`, только маркетинговые обращения)
 * показал перевёрнутое распределение: флагманы пула стояли на РЕДАКТОРЕ,
 * который лишь выносит суждение, а автор — от которого зависит текст — работал
 * на самых слабых и наименее надёжных моделях.
 *
 *   nemotron-3-super-120b:free  89 успехов / 0 отказов — был у редактора
 *   mistral-medium-2604         41 / 0                 — был у редактора
 *   nemotron-3-ultra-free       27 / 2                 — был у редактора
 *   nemotron-3-ultra-550b:free  18 / 1                 — был у редактора
 *   gemma-4-31b-it:free          0 / 1                 — БЫЛ У АВТОРА
 *   deepseek-v4-flash-free       0 / 4                 — БЫЛ У АВТОРА
 *   qwen3.6-27b                 38 / 37                — у автора, он и выдал
 *                                                        утёкший <think>
 *
 * У трёх провайдеров модель автора была МЕРТВА при живой модели редактора:
 * каждое обращение автора туда — гарантированно потраченная попытка из бюджета
 * материала, то есть тот же дефект, что B703 нашёл у Hugging Face, только
 * дешевле не становится от того, что он молчаливый.
 *
 * ⚠ ПОЧЕМУ НЕ ПРОСТО «ПОМЕНЯТЬ МЕСТАМИ ВЕЗДЕ». Там, где модель редактора тоже
 * мертва, менять нечего: провайдер отдаёт автору свою единственную живую
 * модель и честно становится ОДНОМОДЕЛЬНЫМ — обе роли смотрят в одну строку,
 * и `marketingProvidersWithSingleModel()` объявляет это само. Придумать
 * вторую модель нельзя: выдуманное имя — это 404 в бою (B703).
 *
 * ⚠ GEMINI НЕ ТРОГАЕМ. У автора там `3.6-flash` — она новее редакторской
 * `3.5-flash`, то есть роли уже расставлены верно. Перестановка «ради
 * симметрии» отдала бы автору модель постарше.
 */
export const MARKETING_WRITER_MODEL_PREFERENCES: Partial<Record<AIProvider, string>> = {
  // 89/0 — сильнейшая живая модель пула. Вторая модель OpenRouter в замере
  // мертва (0/1), поэтому провайдер становится одномодельным.
  [AIProvider.OPENROUTER]: "nvidia/nemotron-3-super-120b-a12b:free",
  [AIProvider.GEMINI]: "gemini-3.6-flash",
  [AIProvider.CEREBRAS]: "gemma-4-31b",
  [AIProvider.GROQ]: "qwen/qwen3.6-27b",
  // 41/0 против 3/0 у small: обе живы, роли меняются местами.
  [AIProvider.MISTRAL]: "mistral-medium-2604",
  [AIProvider.COHERE]: "command-a-plus-05-2026",
  // B703 — модели, ответившие боевым ключом при НУЛЕВОМ балансе (проба
  // 2026-08-11). У SambaNova и TokenRouter бесплатная модель одна на обе роли:
  // вторая отвечает 402/403. Их одиночество объявляет
  // `marketingProvidersWithSingleModel()`, а не молчание.
  // 18/1 (ultra-550b) против 9/0 (lightning): обе живы, роли меняются местами.
  [AIProvider.KILOCODE]: "nvidia/nemotron-3-ultra-550b-a55b:free",
  [AIProvider.NVIDIA]: "nvidia/nemotron-3-super-120b-a12b",
  // 27/2 против 0/4 у deepseek: провайдер становится одномодельным.
  [AIProvider.OPENCODE_ZEN]: "nemotron-3-ultra-free",
  [AIProvider.TOKENROUTER]: "moonshotai/kimi-k3-free",
  [AIProvider.SAMBANOVA]: "gemma-4-31B-it",
  [AIProvider.HUGGINGFACE]: "prism-ml/Ternary-Bonsai-27B-AWQ-4bit",
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
  // B713: обе роли смотрят в одну модель — вторая (gemma-4-31b-it:free) в
  // замере 14–17.08 дала 0 успехов. Провайдер одномодельный, и это объявлено.
  [AIProvider.OPENROUTER]: "nvidia/nemotron-3-super-120b-a12b:free",
  [AIProvider.GEMINI]: "gemini-3.5-flash",
  [AIProvider.CEREBRAS]: "gemma-4-31b",
  [AIProvider.GROQ]: "qwen/qwen3.6-27b",
  [AIProvider.MISTRAL]: "mistral-small-2603",
  [AIProvider.COHERE]: "command-a-plus-05-2026",
  // B703. У Hugging Face бесплатны ровно две модели — обе `Ternary-Bonsai-27B`
  // с ценой входа $0, разной сборки; на них и разводились роли. B713: сборка
  // `-gguf` в замере дала 0 успехов при 4 отказах, поэтому вторая роль уходит
  // на живую сборку, а провайдер становится одномодельным.
  [AIProvider.KILOCODE]: "nvidia/nemotron-3.5-lightning:free",
  [AIProvider.NVIDIA]: "nvidia/nemotron-3.5-lightning-30b-a3b",
  [AIProvider.OPENCODE_ZEN]: "nemotron-3-ultra-free",
  [AIProvider.TOKENROUTER]: "moonshotai/kimi-k3-free",
  [AIProvider.SAMBANOVA]: "gemma-4-31B-it",
  [AIProvider.HUGGINGFACE]: "prism-ml/Ternary-Bonsai-27B-AWQ-4bit",
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
  // B703 — даты не выдуманы: они сняты из полей `created` тех каталогов,
  // которые их отдают (Kilo и Hugging Face — оба OpenRouter-совместимы), и
  // сверены между каталогами для одних и тех же весов. Там, где каталог даты
  // не отдаёт (NVIDIA NIM, SambaNova, OpenCode Zen ставят `created` временем
  // ответа), взята дата тех же весов из каталога, который её отдаёт.
  "nvidia/nemotron-3.5-lightning:free": "2026-08-11",
  "nvidia/nemotron-3-ultra-550b-a55b:free": "2026-06-04",
  "nvidia/nemotron-3-super-120b-a12b": "2026-03-11",
  "nvidia/nemotron-3.5-lightning-30b-a3b": "2026-08-11",
  "deepseek-v4-flash-free": "2026-07-31",
  "nemotron-3-ultra-free": "2026-06-04",
  "moonshotai/kimi-k3-free": "2026-06-13",
  "gemma-4-31B-it": "2026-04-03",
  "prism-ml/Ternary-Bonsai-27B-AWQ-4bit": "2026-07-11",
  "prism-ml/Ternary-Bonsai-27B-gguf": "2026-07-04",
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

/**
 * B703 — под каким именем провайдер вернул те самые веса.
 *
 * Замер прода 2026-08-13: роутер Hugging Face на запрос
 * `prism-ml/Ternary-Bonsai-27B-AWQ-4bit` отвечает каноническим именем весов
 * `Prism-ML/Ternary-Bonsai-27B` — другой регистр и без хвоста сборки. Сверка
 * шла точным совпадением строки, поэтому УСПЕШНЫЙ ответ выбрасывался как
 * «модель не одобрена», а обращение уходило в бюджет материала. За сутки так
 * пропало 14 успешных вызовов.
 *
 * Ищем одобренные записи, для которых пришедшее имя — это либо та же строка с
 * точностью до регистра, либо её начало по границе разделителя. Граница
 * обязательна: без неё `gpt-4` подошло бы к `gpt-4o-mini`, то есть к ДРУГИМ
 * весам.
 */
function approvedReleasesFor(model: string): string[] {
  const normalized = model.trim().toLowerCase();
  if (!normalized) return [];
  const exact = Object.keys(MARKETING_MODEL_RELEASES).find(
    (key) => key.toLowerCase() === normalized,
  );
  if (exact) return [MARKETING_MODEL_RELEASES[exact]];
  return Object.entries(MARKETING_MODEL_RELEASES)
    .filter(([key]) => {
      const candidate = key.toLowerCase();
      if (!candidate.startsWith(normalized)) return false;
      const boundary = candidate.charAt(normalized.length);
      return boundary === "-" || boundary === "_" || boundary === "." || boundary === ":";
    })
    .map(([, releaseDate]) => releaseDate);
}

export function marketingModelFreshness(model: string): {
  eligible: boolean;
  releaseDate: string | null;
  reason: string;
} {
  const candidates = approvedReleasesFor(model);
  /**
   * Одно общее имя может покрывать несколько сборок одних весов. Личность
   * модели по нему не восстановить — но РЕШЕНИЕ восстановить можно, и только
   * когда оно у всех вариантов одинаково. Берём самую раннюю дату: если она
   * проходит рубеж, проходят и остальные. Неоднозначность решается отказом,
   * а не догадкой.
   */
  const releaseDate = candidates.length > 0
    ? candidates.reduce((earliest, date) => (date < earliest ? date : earliest))
    : null;
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
