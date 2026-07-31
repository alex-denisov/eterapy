import { AIProvider, type AIRoutingPolicy } from "@prisma/client";
import { normalizeAIFeatureKey } from "@/lib/ai-gateway/domain";
import type { AIRoutingPolicyConfig } from "@/lib/ai-gateway/routing";
import {
  isPublicMarketingAIFeature,
  MARKETING_ACTIVE_PROVIDERS,
  MARKETING_REVIEWER_MODEL_PREFERENCES,
  MARKETING_WRITER_MODEL_PREFERENCES,
} from "@/lib/marketing/model-pool";

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

const YANDEX_LITE_MODEL = "yandexgpt-lite/latest";
const YANDEX_PRO_MODEL = "yandexgpt/latest";
const YANDEX_VISION_OCR_MODEL = "yandex-vision-ocr";
const YANDEX_SPEECHKIT_STT_MODEL = "speechkit-stt-async";

const directPremiumOrder = [AIProvider.YANDEX] as const;
const cheapStructuredOrder = [AIProvider.YANDEX] as const;
const freeOrder = [AIProvider.YANDEX] as const;
const directSensitiveOrder = [AIProvider.YANDEX] as const;
const directVisionOrder = [AIProvider.YANDEX] as const;

const cheapModelPreferences: Partial<Record<AIProvider, string>> = {
  [AIProvider.YANDEX]: YANDEX_LITE_MODEL,
};

const premiumModelPreferences: Partial<Record<AIProvider, string>> = {
  [AIProvider.YANDEX]: YANDEX_PRO_MODEL,
};

const sensitiveModelPreferences: Partial<Record<AIProvider, string>> = {
  [AIProvider.YANDEX]: YANDEX_PRO_MODEL,
};

const visionModelPreferences: Partial<Record<AIProvider, string>> = {
  [AIProvider.YANDEX]: YANDEX_VISION_OCR_MODEL,
};

const speechModelPreferences: Partial<Record<AIProvider, string>> = {
  [AIProvider.YANDEX]: YANDEX_SPEECHKIT_STT_MODEL,
};

function defaultModelPreferencesForTier(tier: AITaskTier): Partial<Record<AIProvider, string>> {
  if (tier === "free" || tier === "cheap") return cheapModelPreferences;
  if (tier === "vision") return visionModelPreferences;
  if (tier === "speech") return speechModelPreferences;
  if (tier === "sensitive" || tier === "compliance") return sensitiveModelPreferences;
  return premiumModelPreferences;
}

const DEFAULT_AI_TASK_POLICY_DEFINITIONS: AITaskPolicyDefinition[] = [
  {
    feature: "dialogue-primary-answer",
    enabled: true,
    // B554 (owner 2026-07-21): тир `free` разрешался в cheapModelPreferences,
    // то есть YandexGPT **Lite**. Живой прогон staging это подтвердил:
    // dialogue-primary-answer уходил на `yandexgpt-lite/latest`. Разбор — это
    // ЕДИНСТВЕННЫЙ текст, который клиент реально читает после диалога, и по нему
    // он решает, возвращаться ли. Экономить на нём Lite-моделью означает
    // экономить ровно на том, что продаёт продукт. Тир поднят до premium (Pro);
    // бесплатность разбора обеспечивается лимитом 3 разбора/сутки, а не слабой
    // моделью.
    tier: "premium",
    title: "Free первичный разбор",
    purpose: "Бесплатный вход: короткий первичный разбор и мягкий следующий шаг.",
    providerOrder: [...directPremiumOrder],
    // Пять блоков структуры не помещались в 900 токенов.
    maxTokens: 1400,
    temperature: 0.45,
    timeoutMs: 30_000,
    // Issue #2/#3: no per-user daily TOKEN cap — the free разбор must ALWAYS be
    // LLM-written, never silently degraded to scripted content when a user (or a
    // founder testing) burns tokens. Abuse is bounded by the 3-разбора/day COUNT
    // limit (checkStandaloneDialogueDailyLimit), not by starving the model.
    fallbackNotes: "Yandex-only; всегда LLM, без per-user token cap (лимит — по числу разборов).",
  },
  {
    feature: "dialogue-clarifier",
    enabled: true,
    // B554 (owner 2026-07-21): «диалог всё время спрашивает "почему" на любое
    // моё сообщение… мне неприятно общаться с таким искусственным
    // собеседником». Уточнение — самая разговорно-сложная задача продукта
    // (услышать полутон, отразить своими словами, не скатиться в опросник), а
    // выполняла её самая слабая модель во флоте. Lite → Pro.
    tier: "premium",
    title: "Уточняющие вопросы",
    purpose: "Персональные уточнения перед первичным ответом — один вопрос за ход.",
    providerOrder: [...directPremiumOrder],
    // Отражение + вопрос длиннее одного вопроса, 400 токенов резали реплику.
    maxTokens: 700,
    // Ниже температура — меньше вычурности, стабильнее следование контракту.
    temperature: 0.45,
    timeoutMs: 25_000,
    // Issue #3: no per-user token cap — clarifying questions are always LLM.
    fallbackNotes: "YandexGPT Pro: качество живого диалога важнее цены хода; всегда LLM, без per-user token cap.",
  },
  {
    feature: "daily-practice",
    enabled: true,
    tier: "free",
    title: "Ежедневная практика (день)",
    purpose: "Ежедневная практика: вопрос дня → взгляд дня → маленький шаг. Бесплатный ритуал самонаблюдения.",
    providerOrder: [...freeOrder],
    maxTokens: 500,
    temperature: 0.8,
    timeoutMs: 25_000,
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
    // Issue #3: routing must run for every разбор so the topic/triage is real.
    fallbackNotes: "Structured direct mini/haiku first; всегда LLM, без per-user token cap.",
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
    // Safety triage must NEVER be budget-blocked — crisis detection can't be
    // skipped because a user has used many tokens today.
    fallbackNotes: "No OpenRouter: direct providers and human review boundary for high risk; без per-user token cap.",
  },
  {
    feature: "product-reframe",
    enabled: true,
    tier: "premium",
    title: "Когнитивный рефрейминг (Переосмысление)",
    purpose: "Платный разбор одной ситуации под четырьмя углами (мысли, чувства, другой взгляд, шаг) по методу когнитивного рефрейминга — самодостаточный, без первичного диалога. Все четыре угла генерируются LLM под контекст пользователя.",
    providerOrder: [...directPremiumOrder],
    maxTokens: 5200,
    temperature: 0.55,
    timeoutMs: 60_000,
    fallbackNotes: "Paid value uses direct premium provider, Anthropic as fallback. Бюджет токенов рассчитан на полный JSON из четырёх развёрнутых углов (не обрезать).",
  },
  {
    feature: "product-deep-report",
    enabled: true,
    tier: "premium",
    title: "Подробный разбор (клиническая формулировка случая)",
    purpose: "Платный подробный документ-разбор (≥3500 слов) по методу клинической формулировки случая (5P) + problem-solving; роль — психотерапевт-супервизор с 20-летним стажем. Самодостаточный, без первичного диалога.",
    providerOrder: [...directPremiumOrder],
    maxTokens: 11000,
    temperature: 0.55,
    timeoutMs: 120_000,
    fallbackNotes: "No free models for long paid synthesis. Бюджет токенов рассчитан на полный документ (≥3500 слов).",
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
    maxTokens: 3000,
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
    fallbackNotes: "Yandex Vision OCR only; image is not persisted after OCR.",
  },
  {
    feature: "product-chat-analysis-ocr-structure",
    enabled: true,
    tier: "sensitive",
    title: "Структурирование OCR переписки",
    purpose: "YandexGPT step that converts Yandex Vision OCR lines with coordinates into a messenger transcript with sender side, time/status and visible media markers.",
    providerOrder: [...directSensitiveOrder],
    modelPreferences: { [AIProvider.YANDEX]: YANDEX_PRO_MODEL },
    maxTokens: 3000,
    temperature: 0,
    timeoutMs: 45_000,
    fallbackNotes: "Yandex-only text structuring over OCR coordinates; no foreign provider and no image persistence.",
  },
  {
    feature: "product-chat-analysis",
    enabled: true,
    tier: "vision",
    title: "Разбор переписки",
    purpose: "Text/vision pipeline после PII masking и user confirmation.",
    providerOrder: [...directSensitiveOrder],
    modelPreferences: { [AIProvider.YANDEX]: YANDEX_PRO_MODEL },
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
    feature: "product-outside-questions",
    enabled: true,
    tier: "cheap",
    title: "Взгляд со стороны — вопросы",
    purpose: "Генерация 3–5 нейтральных вопросов для приглашенного близкого человека без раскрытия приватной ситуации пользователя.",
    providerOrder: [...cheapStructuredOrder],
    maxTokens: 400,
    temperature: 0.6,
    timeoutMs: 25_000,
    fallbackNotes: "YandexGPT Lite; если вопросы раскрывают приватные детали, код откатывается на безопасный эвристический набор.",
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
    // B450: полноценный многоглавный разбор (Солнце/Луна/Асцендент/акценты/рост/шаги)
    // без системного кап-лимита — как у deep-report. Эффективный кап (routing.ts:138).
    maxTokens: 7000,
    temperature: 0.45,
    timeoutMs: 45_000,
    fallbackNotes: "Если время рождения неизвестно, модель не утверждает дома/ASC как факт.",
  },
  {
    feature: "product-compatibility-by-date",
    enabled: true,
    tier: "premium",
    title: "Совместимость по дате",
    purpose: "Сравнение двух натальных карт как символического языка динамики пары.",
    providerOrder: [...directPremiumOrder],
    // B451: полный многоглавный разбор пары по реальным знакам Солнца обоих.
    maxTokens: 6500,
    temperature: 0.45,
    timeoutMs: 45_000,
    fallbackNotes: "Не выносит verdict по отношениям; показывает ресурсы, различия и вопросы для разговора.",
  },
  {
    feature: "product-horoscope",
    enabled: true,
    tier: "premium",
    title: "Гороскоп",
    purpose: "Прямой ответ на один зафиксированный вопрос по карте момента.",
    providerOrder: [...directPremiumOrder],
    maxTokens: 7000,
    temperature: 0.35,
    timeoutMs: 60_000,
    fallbackNotes: "Карта и момент считаются детерминированно; промт редактируется в суперадминке.",
  },
  {
    feature: "product-arcana",
    enabled: true,
    tier: "premium",
    title: "Арканы судьбы",
    purpose: "Детерминированная пара карт рождения Таро по дате.",
    providerOrder: [...directPremiumOrder],
    maxTokens: 7000,
    temperature: 0.42,
    timeoutMs: 60_000,
    fallbackNotes: "Только рассчитанные арканы; без случайных карт. Промт редактируется в суперадминке.",
  },
  {
    feature: "product-numerology",
    enabled: true,
    tier: "premium",
    title: "Матрица судьбы",
    purpose: "Матрица судьбы по 22 энергиям: десять позиций, предназначения, линии и возрастные периоды.",
    providerOrder: [...directPremiumOrder],
    // B451: полный многоглавный разбор по реальным ядровым числам.
    maxTokens: 6000,
    temperature: 0.45,
    timeoutMs: 45_000,
    fallbackNotes: "Числа интерпретируются бережно, без предсказаний и давления.",
  },
  {
    // B389 (M26): genogram-разбор «Семейные вопросы».
    feature: "product-family-questions",
    enabled: true,
    tier: "premium",
    title: "Семейные вопросы",
    purpose: "Genogram-язык повторов рода без фатальности и обвинения семьи.",
    providerOrder: [...directPremiumOrder],
    // B451: полный многоглавный genogram-разбор.
    maxTokens: 6500,
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
    // B451: полный многоглавный разбор по рассчитанному бодиграфу.
    maxTokens: 6500,
    temperature: 0.45,
    timeoutMs: 45_000,
    fallbackNotes: "Опирается на детерминированно посчитанный чарт; не выдумывает тип и числа.",
  },
  {
    // B515: deterministic Cyrillic code + Major Arcana + lineage-pattern audit.
    feature: "product-surname-origin",
    enabled: true,
    tier: "premium",
    title: "Происхождение фамилии",
    purpose: "Прямой аудит рассчитанного кода фамилии, Аркана, родового ресурса, тени и сценария смены имени.",
    providerOrder: [...directPremiumOrder],
    // B451: полный многоглавный родовой разбор.
    maxTokens: 6000,
    temperature: 0.5,
    timeoutMs: 45_000,
    fallbackNotes: "Опирается на видимую формулу и рассчитанные коды; не выдумывает генеалогию или финансовые пределы.",
  },
  {
    // B386/M29: чат-компаньон. Ответы остаются диалоговыми, но лимит должен
    // позволять экспертную гипотезу, вариант действия и естественный итог.
    // Issue #8: title/purpose name the catalog service so it's findable in
    // orchestration as the /products/chat «Решить вопрос в чате» service.
    feature: "companion-chat",
    enabled: true,
    tier: "premium",
    title: "Чат-компаньон · «Решить вопрос в чате» (/products/chat)",
    purpose: "Услуга «Решить вопрос в чате» (/products/chat): экспертный диалог с одной выбранной ролью на сессию, темпом 45/30 минут, предохранителями и без раскрытия природы.",
    providerOrder: [...directPremiumOrder],
    maxTokens: 700,
    temperature: 0.6,
    timeoutMs: 45_000,
    fallbackNotes: "Кризис → safety-сообщение и хэндофф; «ты бот?» → мягкий уход; не раскрывает ИИ/живого специалиста.",
  },
  {
    // B610: public, no-PII marketing uses only free-quota foreign connectors.
    // Runtime rotates the order and excludes writer's provider from review.
    feature: "marketing-agent-writer",
    enabled: true,
    tier: "free",
    title: "SMM-агент · автор",
    purpose: "Создание собственных постов и обезличенных рекламных комментариев по контент-плану.",
    providerOrder: [...MARKETING_ACTIVE_PROVIDERS],
    modelPreferences: { ...MARKETING_WRITER_MODEL_PREFERENCES },
    maxTokens: 1500,
    temperature: 0.55,
    timeoutMs: 45_000,
    // Потолок — предохранитель от разгона, а НЕ суточная норма и не защита от
    // расходов: весь пул SMM-агента бесплатный, платить тут не за что.
    //
    // Замер прода 2026-07-31 04:12 MSK: writer 585 123 токена за 74 запроса
    // при потолке 600k, reviewer 402 176 при потолке 400k — то есть агент
    // остановился о НАШ счётчик, а не о квоту провайдера, и сказал об этом
    // «кончилась ёмкость провайдеров». Настоящий предел на бесплатных тарифах
    // ставит сам провайдер; наш потолок лишь заставлял падать раньше и с
    // неверным объяснением.
    //
    // Владелец 2026-07-31: «учитывая, что у нас только бесплатные модели, есть
    // смысл поднять лимит так, чтобы всем агентам хватало». Потолки подняты в
    // пять раз и остаются страховкой от бесконечного цикла — тем единственным,
    // от чего они реально защищают.
    dailyTokenBudget: 3_000_000,
    fallbackNotes: "Получает публичный пост, но не внутренние данные пользователей ETerapy; комментарий всегда идёт в Telegram-премодерацию.",
  },
  {
    feature: "marketing-agent-reviewer",
    enabled: true,
    tier: "cheap",
    title: "SMM-агент · выпускающий редактор",
    purpose: "Независимая проверка полезности, честности, безопасности и соответствия правилам площадки.",
    providerOrder: [...MARKETING_ACTIVE_PROVIDERS].reverse(),
    modelPreferences: { ...MARKETING_REVIEWER_MODEL_PREFERENCES },
    maxTokens: 1200,
    temperature: 0.1,
    timeoutMs: 35_000,
    // См. комментарий у writer: редактор вызывается на каждой итерации автора,
    // поэтому его расход идёт вровень с авторским и упирался в потолок первым.
    dailyTokenBudget: 2_000_000,
    fallbackNotes: "Другая модель, чем writer. REVIEW/REJECT блокирует выпуск; комментарий не публикуется без человека.",
  },
  {
    // B628 — ответы людям и плановые публикации больше не делят один кошелёк.
    // Потолок здесь заведомо меньше: ответ короче поста, редакторских кругов у
    // него столько же, но объём в разы ниже. Смысл не в размере, а в том, что
    // эту ёмкость невозможно занять генерацией контент-плана.
    feature: "marketing-reply-writer",
    enabled: true,
    tier: "free",
    title: "SMM-агент · автор ответов",
    purpose: "Ответы на комментарии, упоминания и сообщения — отдельная ёмкость, чтобы выпуск плана не мог их заблокировать.",
    providerOrder: [...MARKETING_ACTIVE_PROVIDERS],
    modelPreferences: { ...MARKETING_WRITER_MODEL_PREFERENCES },
    maxTokens: 1200,
    temperature: 0.55,
    timeoutMs: 45_000,
    dailyTokenBudget: 1_000_000,
    fallbackNotes: "Разговорный регистр, обязательная премодерация человеком, кризисные формулировки уходят человеку без ответа агента.",
  },
  {
    feature: "marketing-reply-reviewer",
    enabled: true,
    tier: "cheap",
    title: "SMM-агент · редактор ответов",
    purpose: "Независимая проверка ответа: тон, честность, безопасность, правила площадки.",
    providerOrder: [...MARKETING_ACTIVE_PROVIDERS].reverse(),
    modelPreferences: { ...MARKETING_REVIEWER_MODEL_PREFERENCES },
    maxTokens: 1000,
    temperature: 0.1,
    timeoutMs: 35_000,
    dailyTokenBudget: 700_000,
    fallbackNotes: "Другая модель, чем у автора ответа. Без утверждения ответ не уходит.",
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
    modelPreferences: { [AIProvider.YANDEX]: YANDEX_PRO_MODEL },
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
    modelPreferences: { [AIProvider.YANDEX]: YANDEX_SPEECHKIT_STT_MODEL },
    maxTokens: 1200,
    temperature: 0,
    timeoutMs: 60_000,
    perUserDailyTokenBudget: 4000,
    fallbackNotes: "Yandex SpeechKit async STT only; requires Object Storage handoff before audio is sent.",
  },
];

export const DEFAULT_AI_TASK_POLICIES: AITaskPolicyDefinition[] = DEFAULT_AI_TASK_POLICY_DEFINITIONS.map((policy) => ({
  ...policy,
  modelPreferences: isPublicMarketingAIFeature(policy.feature)
    ? { ...(policy.modelPreferences ?? {}) }
    : {
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
