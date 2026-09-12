import type { AIProvider } from "@prisma/client";
// B700: `Prisma` нужен значением, а не только типом — `Prisma.DbNull` очищает
// колонку `Json?`, и обычный `null` для неё означает «не менять».
import { Prisma } from "@prisma/client";
import { aiComplete } from "@/lib/ai";
import { AIGatewayRoutingError } from "@/lib/ai-gateway/routing";
import db from "@/lib/db";
import { approvedStatusForPlatform, MARKETING_MANUAL_STATUS } from "@/lib/marketing/manual-platforms";
import { log, serializeError } from "@/lib/logger";
import {
  marketingReviewerPrompt,
  marketingReviewerSystemPrompt,
  marketingSmmReviewerSystemPrompt,
  marketingSmmSystemPrompt,
  marketingWriterPrompt,
  marketingWriterSystemPrompt,
} from "@/lib/marketing/agent-prompt";
import {
  ENGAGEMENT_TONE_HARD_LIMITS,
  engagementToneById,
} from "@/lib/marketing/engagement-tone";
import { requestMarketingModeration } from "@/lib/marketing/moderation";
import {
  INBOUND_REPLY_CONTENT_TYPE,
  isConversationalContentType,
} from "@/lib/marketing/perimeter";
import {
  MARKETING_ACTIVE_PROVIDERS,
  MARKETING_PAID_PROVIDERS,
  MARKETING_REPLY_REVIEWER_FEATURE,
  MARKETING_REPLY_WRITER_FEATURE,
  marketingModelFreshness,
  marketingModelFreshnessApplies,
  marketingProviderFromLabel,
  marketingPaidFallbackEnabled,
  marketingProviderOrder,
  marketingReasoningSuppression,
} from "@/lib/marketing/model-pool";
import {
  paidRouteBudgetStates,
  paidRouteMaxOutputTokens,
  recordPaidRouteSpend,
} from "@/lib/marketing/paid-route-budget";
import {
  marketingHourlyCapacity,
  marketingPoolAvailability,
  marketingPoolResumeAt,
} from "@/lib/marketing/pool-capacity";
import {
  conveyorTact,
  marketingLinePauseUntil,
  orderByUrgency,
  type ConveyorBottleneck,
} from "@/lib/marketing/conveyor-tact";
import {
  awaitingReviewFilter,
  conversationalFilter,
  dueNowFilter,
  plannedFilter,
  readyForWorkFilter,
} from "@/lib/marketing/conveyor-queues";
import { marketingMaxAwaitingReview } from "@/lib/marketing/conveyor-settings";
import { contentPlanFor } from "@/lib/marketing/content-plan";
import { dzenFeedNeedsTopUp } from "@/lib/marketing/dzen-feed";
import {
  draftLimitViolations,
  ctaWordsOf,
  fallbackCta,
  fallbackMediaBrief,
  CTA_MIN_WORDS,
  platformLimitsForPrompt,
  platformPublishLimits,
  trimToLimit,
  type LimitViolation,
} from "@/lib/marketing/platform-limits";
import { calculateWeightedScore, inspectDraft } from "@/lib/marketing/draft-inspection";
import { reconcileReviewWithMachine } from "@/lib/marketing/review-machine-authority";
import { rejectNonPostWriterOutput } from "@/lib/marketing/writer-output-guard";
import { pickBestDraft } from "@/lib/marketing/best-draft";
import { platformContract, type PlatformContract } from "@/lib/marketing/platform-playbook";
import { resolvePlatformContract } from "@/lib/marketing/playbook-settings";
import { coverLayoutFor } from "@/lib/marketing/cover-layout";
import { generatePaidCover, isPaidCoverPlatform } from "@/lib/marketing/cover-image";
import { buildMarketingResearchBrief } from "@/lib/marketing/research";
import { buildConversationMemory } from "@/lib/marketing/conversation-memory";

/**
 * Кончилась ёмкость (суточный потолок токенов или квота провайдера) — это
 * состояние инфраструктуры, а не брак материала. Прежде оба случая приводили
 * к одному исходу: публикация помечалась FAILED навсегда и молча выпадала из
 * плана. Замер прода 2026-07-30 показал 121 такую строку за сутки при нуле
 * реальных выходов в VK и Telegram.
 */
export class MarketingCapacityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketingCapacityError";
  }
}

/**
 * B695 — дорога отвалилась: таймаут, 5xx, пустой ответ, ошибка провайдера.
 *
 * От ёмкости отличается тем, что ждать возврата квоты нечего, и проход НЕ
 * останавливается: следующий материал может уйти по другому маршруту. От брака
 * материала — тем, что о самом тексте эти коды не сказали ничего.
 */
export class MarketingInfrastructureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketingInfrastructureError";
  }
}

/**
 * B623 — писатель и редактор сошлись на одной модели. Это тоже состояние пула,
 * а не брак материала: сузился набор живых провайдеров. Материал ждёт, пока
 * появится вторая независимая модель, и не сжигает попытку.
 */
export class MarketingModelSeparationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketingModelSeparationError";
  }
}

/**
 * B644 — ответ модели оборван нашим же лимитом вывода.
 *
 * Разбор такого ответа падает всегда: JSON физически не дописан. Прежде это
 * называлось «ни один провайдер не вернул валидную структуру», и разбор уходил
 * проверять ключи и квоты, хотя провайдеры были исправны — три «отказа» из
 * четырёх были одним и тем же оборванным ответом, полученным по трём маршрутам.
 *
 * Отдельный класс нужен ради поведения, а не ради формулировки: перебирать
 * провайдеров с тем же бюджетом бессмысленно (тот же обрыв ×6), а повторять
 * материал с тем же лимитом — тем более.
 */
export class MarketingTruncatedOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketingTruncatedOutputError";
  }
}

/**
 * B705 — весь перебор ответил не постом.
 *
 * Отдельный класс нужен ради поведения. Один отвергнутый ответ снимает
 * маршрут, и следующий провайдер отвечает нормально — это обычное дело. Но
 * если постом не оказался НИ ОДИН ответ, причина лежит в моделях, а не в
 * материале: тема, план и промт у всех двенадцати маршрутов были одни и те же.
 * Без этого класса такой случай падал бы в общее «No free provider returned
 * valid structured output», то есть в приговор материалу — ровно та ошибка,
 * которую B695 уже разобрал на обрыве по потолку и на отказе дороги.
 */
export class MarketingWriterGarbageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketingWriterGarbageError";
  }
}

/**
 * B680 — один материал не имеет права съесть суточную ёмкость.
 *
 * Замер прода 2026-08-06 (`ai_requests`, роли агента, двое суток): 1190 вызовов
 * и 6.6 млн токенов на ПЯТЬ вышедших публикаций — по ~120 вызовов на материал
 * при среднем промпте около 5 тысяч токенов. Редактор при этом каждые сутки
 * упирался ровно в свой потолок 2 000 000, после чего проход переходил в
 * cooldown с 103 отложенными строками.
 *
 * Ёмкость съедает не длина текста, а ВЕЕР ПОВТОРОВ: раунд правки × перебор
 * провайдеров × ступени бюджета вывода. Каждая неудачная попытка платит полным
 * промптом, и стоит она столько же, сколько удачная. Ограничение по числу
 * попыток на материал — единственный рубеж, который держит расход независимо от
 * того, какой именно провайдер сегодня сломан.
 *
 * Это НЕ брак материала: строка остаётся черновиком и возвращается следующим
 * проходом (`isDeferrableError`), когда пул уже может быть здоров.
 */
export class MarketingAttemptBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketingAttemptBudgetError";
  }
}

/**
 * Полезные обращения: три полных раунда «автор + редактор». Больше уже не даёт
 * материала — в замере прода материалы с сотней попыток не выходили ни разу.
 */
const USEFUL_ATTEMPTS_PER_MATERIAL = 6;

/**
 * Сколько обращений к моделям тратится на ОДИН материал за проход — обе роли,
 * все раунды правки, все ступени бюджета вывода вместе.
 *
 * B703 — величина перестала быть константой, и вот почему. Прежние 12 читались
 * как «6 полезных плюс двойной запас», но вторая половина на деле была запасом
 * НА ОДИН ПОЛНЫЙ ПЕРЕБОР ПУЛА: провайдеров было ровно шесть. Как только пул
 * вырос до двенадцати, один неудачный перебор стал съедать весь бюджет
 * целиком — и материал снова умирал бы от расхода, а не от собственного
 * качества. Ровно тот дефект, который разбирал B699; он вернулся бы молча и
 * ровно в день, когда ёмкости стало БОЛЬШЕ.
 *
 * Поэтому запас считается от размера пула, а не от числа. При шести
 * провайдерах формула даёт прежние 12 — для старого пула не меняется ничего.
 */
export function maxStructuredAttemptsPerMaterial(
  poolSize: number = MARKETING_ACTIVE_PROVIDERS.length,
): number {
  return USEFUL_ATTEMPTS_PER_MATERIAL + Math.max(poolSize, 1);
}

/** @deprecated читайте `maxStructuredAttemptsPerMaterial()` — бюджет зависит от пула. */
export const MAX_STRUCTURED_ATTEMPTS_PER_MATERIAL = maxStructuredAttemptsPerMaterial();

/**
 * B644 — признак обрыва по лимиту вывода. Площадки называют его по-разному:
 * Gemini и Cohere — `MAX_TOKENS`, OpenAI-совместимые — `length`, Anthropic —
 * `max_tokens`.
 */
export function isTruncatedCompletion(finishReason: string | null | undefined): boolean {
  if (!finishReason) return false;
  const normalized = finishReason.trim().toLowerCase();
  return normalized === "length" || normalized.replaceAll("-", "_").includes("max_tokens");
}

/**
 * B644 — потолок бюджета вывода на одну структурную попытку.
 *
 * Замер прода 2026-08-03 (`ai_requests`, только маркетинговые роли): p90
 * ВИДИМОГО вывода — 1151 токен у редактора и 1080 у автора, максимум 1200/1500.
 * В потолок видимый вывод не упирался ни разу, а `finishReason` был `MAX_TOKENS`
 * в каждой попытке: модели маршрута думающие, и токены размышления тратятся из
 * того же бюджета, не попадая в `completion_tokens`. Отсюда и надбавка — она
 * покрывает размышление, а не текст.
 *
 * B668 — потолок поднят с 8000 до 16000 по замеру прода 2026-08-05: материал
 * всё ещё архивировался с «Ответ модели gemini-3.5-flash обрезан по лимиту
 * вывода 8000 токенов», то есть лестница 4000 → 7000 → 8000 упиралась в самый
 * верх и там сдавалась. Поднимать безопаснее, чем оставлять: обрезанная
 * попытка тратит бюджет ПОЛНОСТЬЮ и не даёт ничего — это худший из возможных
 * расходов, а не экономия. Размышление думающих моделей в `completion_tokens`
 * не видно, поэтому по видимому выводу (p90 ≈ 1.1k) потолок оценить нельзя.
 */
export const MARKETING_MAX_STRUCTURED_OUTPUT_TOKENS = 16_000;
const TRUNCATION_BUDGET_FACTOR = 1.75;

/**
 * B644 — стартовые бюджеты ролей. Были 2200 у автора и 1600 у редактора: на
 * текст хватало с запасом, на «текст плюс размышление» — нет ни разу.
 *
 * B718 — старт равен потолку по той же причине, что у редактора ниже. Лестница
 * автора была 4000 → 7000 → 12250 → 16000: до четырёх полных вызовов одного
 * промта ради одного текста (замер 48 часов — 19 таких обрывов у
 * `gemini-3.6-flash`). Потолок не резервируется и не оплачивается.
 */
export const MARKETING_WRITER_MAX_TOKENS = MARKETING_MAX_STRUCTURED_OUTPUT_TOKENS;
/**
 * B695 — у редактора своя ступень, выше авторской.
 *
 * Замер реестра прода 2026-08-06: ВСЕ десять обрывов по лимиту вывода пришлись
 * на модели роли редактора (`nemotron-3-super` — 8, `gemini-3.5-flash` — 2), у
 * автора — ни одного. Роль различает не длина ответа (у редактора она меньше),
 * а размышление: маршруты редактора думающие.
 *
 * Поднимать здесь дёшево: `maxTokens` — потолок, а не расход, и платим мы за
 * фактический вывод. Зато обрезанный шаг лестницы платит ПОЛНЫМ промптом и не
 * даёт ничего — стартовать с 4000 значит гарантированно выбросить две ступени.
 *
 * B718 — РАССУЖДЕНИЕ ДОВЕДЕНО ДО КОНЦА: СТАРТ РАВЕН ПОТОЛКУ.
 *
 * Комментарий выше говорит верную вещь и останавливается на полпути. Если
 * `maxTokens` — это потолок, а не резерв, то любое стартовое значение НИЖЕ
 * потолка не экономит ничего и стоит целой ступени всякий раз, когда модель
 * думает дольше ожидаемого. Замер прода 2026-08-23 по логу
 * `eterapy-marketing-agent-1` за 48 часов: 167 событий `output-truncated`, из
 * них ~135 у редактора — ступени 8000 → 14000 → 16000. То есть ОДИН вердикт
 * стоил трёх полных вызовов с промтом в 5 400 токенов вместо одного, и
 * добирались до тех же 16 000, с которых можно было начать бесплатно.
 *
 * Средний УСПЕШНЫЙ вердикт редактора — 943 токена вывода (`ai_attempts`,
 * 623 успеха за неделю). Расход не вырастет: платим за то, что модель
 * действительно выдала. Исчезает только лестница.
 *
 * ⚠ Что теперь означает обрыв. Стартуя с потолка, повышать некуда, и
 * `nextBudget <= budget` уводит маршрут в `MarketingTruncatedOutputError` —
 * то есть в СЛЕДУЮЩЕГО провайдера, а не в третий заход к тому же. Это и есть
 * правильный ответ на «эта модель не уложилась»: пробовать другую, а не
 * оплачивать тот же обрыв заново.
 */
export const MARKETING_REVIEWER_MAX_TOKENS = MARKETING_MAX_STRUCTURED_OUTPUT_TOKENS;

const CAPACITY_ERROR_MARKERS = [
  "daily token budget exceeded",
  "rate limit",
  "rate_limit",
  "quota",
  "429",
  "insufficient_quota",
];

/**
 * B692 — коды попыток, спрятанные в обёртке маршрутизатора.
 *
 * `AIGatewayRoutingError` сообщает «все провайдеры отказали» и НЕ повторяет в
 * тексте причину: она лежит в `attempts[].code`. Пока классификация смотрела
 * только на текст, исчерпанная квота выглядела браком материала, и хороший
 * текст сгорал в `FAILED` вместо того, чтобы дождаться следующего прохода.
 *
 * Требуем, чтобы ёмкостными были ВСЕ отказы: один посторонний код означает, что
 * дело не только в квоте, и ждать «пока само пройдёт» было бы неправдой.
 */
const CAPACITY_ATTEMPT_CODES = new Set([
  "HTTP_429",
  "HTTP_402",
  "RATE_LIMITED",
  "INSUFFICIENT_CREDITS",
  // B694: ключи провайдера остывают после квоты. Это та же исчерпанная ёмкость,
  // только замеченная на проход позже — и она тоже проходит сама. До правки
  // такой проход приходил кодом `MISSING_ADAPTER`, ёмкостью не считался, и
  // годный материал сгорал в FAILED.
  "PROVIDER_COOLDOWN",
]);

/**
 * B695 — коды, при которых ждать бесполезно: нужен человек.
 *
 * Адаптера нет вовсе, ключ не принят, запрос отвергнут как неверный — всё это
 * не проходит само по себе. Такой отказ обязан оставаться жалобой, иначе
 * сломанная конфигурация будет молча копить черновики.
 *
 * Всё остальное на уровне маршрута — состояние дороги: таймаут, 5xx, пустой
 * ответ, ошибка провайдера. О материале эти коды не говорят ничего.
 */
const NON_DEFERRABLE_ATTEMPT_CODES = new Set([
  "MISSING_ADAPTER",
  "MISSING_CONFIG",
  "HTTP_400",
  "HTTP_401",
  "HTTP_403",
]);

function routingErrorCodes(error: unknown): string[] {
  if (!(error instanceof AIGatewayRoutingError)) return [];
  return (error.attempts ?? [])
    .map((attempt) => attempt.code)
    .filter((code): code is string => Boolean(code));
}

function routingErrorIsCapacity(error: unknown): boolean {
  const codes = routingErrorCodes(error);
  return codes.length > 0 && codes.every((code) => CAPACITY_ATTEMPT_CODES.has(code));
}

/**
 * B695 — отказ ДОРОГИ, а не материала.
 *
 * Замер прода 2026-08-06: правило B692 «откладываем, только если ВСЕ коды
 * ёмкостные» отправляло в `FAILED` проходы, где среди остывших ключей
 * попадался один `TIMEOUT` или `HTTP_503`. Оттуда материал за две попытки
 * восстановления уезжал в `ARCHIVED` с освобождением слота (B643) — 36 строк
 * по реестру.
 *
 * Настоящий брак материала кодом маршрута не приходит: он приходит ошибкой
 * разбора ПОЛНОГО ответа, safety-флагом или решением редактора, и все три
 * обрабатываются отдельно. Поэтому граница проходит по вине конфигурации, а не
 * по признаку ёмкости.
 */
export function isInfrastructureRoutingError(error: unknown): boolean {
  const codes = routingErrorCodes(error);
  return codes.length > 0 && codes.every((code) => !NON_DEFERRABLE_ATTEMPT_CODES.has(code));
}

export function isCapacityError(error: unknown): boolean {
  if (error instanceof MarketingCapacityError) return true;
  if (error instanceof Error && error.name === "AIBudgetExceededError") return true;
  if (routingErrorIsCapacity(error)) return true;
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return CAPACITY_ERROR_MARKERS.some((marker) => message.includes(marker));
}

/**
 * Отказ, который пройдёт сам: кончилась ёмкость или в пуле не осталось второй
 * независимой модели. Такая строка остаётся черновиком и уходит в следующий
 * проход — FAILED здесь означал бы «материал негоден», а он не при чём.
 */
export function isDeferrableError(error: unknown): boolean {
  return isCapacityError(error)
    || error instanceof MarketingModelSeparationError
    // B680: попытки кончились у ОДНОГО материала, а не ёмкость у системы.
    // Материал годен и ждёт следующего прохода — `FAILED` тут был бы неправдой.
    || error instanceof MarketingAttemptBudgetError
    // B695: обрыв по НАШЕМУ потолку вывода. Текст не виноват в том, что модель
    // потратила бюджет на размышление; следующий проход возьмёт другую модель.
    || error instanceof MarketingTruncatedOutputError
    // B705: постом не оказался ни один ответ перебора. Отвечали модели, а тема
    // и промт у всех были одни — судить материал не по чему.
    || error instanceof MarketingWriterGarbageError
    // B695: дорога отвалилась — таймаут, 5xx, пустой ответ. Материал ни при чём.
    || error instanceof MarketingInfrastructureError
    || isInfrastructureRoutingError(error);
}

/**
 * B638 — упёрлись ли мы в СВОЙ потолок, а не в квоту провайдера.
 *
 * Эти две причины требуют противоположных действий: наш потолок поднимается
 * числом в `task-policy`, чужая квота — ожиданием или другим аккаунтом. Пока
 * сигнал называл обе «кончилась ёмкость провайдеров», владелец шёл проверять
 * ключи там, где менять нужно было наше число.
 */
export function isOwnBudgetCeiling(message: string): boolean {
  return message.toLowerCase().includes("daily token budget exceeded");
}

type WriterOutput = {
  title: string;
  text: string;
  audienceNeed: string;
  goal: string;
  disclosure: string;
  cta: string;
  mediaBrief: string;
  researchUsed: string[];
  safetyFlags: string[];
};

type ReviewerOutput = {
  decision: "APPROVE" | "REVISE" | "REJECT";
  scores: Record<string, number>;
  issues: string[];
  revisionBrief: string[];
  revisedText?: string;
  summary: string;
};

type AICompletion = Awaited<ReturnType<typeof aiComplete>>;
type StructuredCompletion<T> = { response: AICompletion; value: T };

const LOOP_LIMIT = 3;
/**
 * B724 — лимит раундов доработки между автором и редактором ограничен 1 циклом
 * (вместо бесконечного пинг-понга и выжигания до 94 вызовов LLM на пост).
 */
const EDITORIAL_ROUND_LIMIT = 1;

/**
 * B700 фаза 6 (страховка) — сколько кругов правки материал получает за всю
 * жизнь, а не за один проход.
 *
 * Шесть — это два полных круга по три раунда. Смысл границы: сходящаяся правка
 * укладывается в первые два-три раунда (замер 11.08 показал, что замечания
 * повторяются, а не заменяются), поэтому второй круг — это запас на редкий
 * случай, а не режим работы. Всё, что не сошлось за шесть раундов, сходиться
 * уже не собирается, и дальше платить за него нельзя.
 *
 * B718 — ШЕСТЬ СТАЛО ТРЕМЯ, И ЭТО СЛЕДСТВИЕ ИЗ УЖЕ НАПИСАННОГО ВЫШЕ.
 *
 * Комментарий сам говорит: «сходящаяся правка укладывается в первые два-три
 * раунда», «второй круг — запас на редкий случай». Замер прода 2026-08-23 за
 * двое суток: автор 100 обращений, редактор 284 — то есть 2,8 рецензии на одно
 * написание. Запас перестал быть редким случаем и стал режимом работы, а
 * вместе с ним 623 успешные рецензии за неделю на 14 выпущенных материалов
 * (44 рецензии на пост).
 *
 * Второй круг больше не оплачивается, и материал при этом НЕ гибнет: с B713
 * исчерпанный круг выпускает лучший черновик с пометкой о незакрытых
 * замечаниях. Раньше сокращение кругов означало бы больше смертей — теперь оно
 * означает более ранний выпуск.
 */
const EDITORIAL_LIFETIME_ROUND_LIMIT = Math.max(
  EDITORIAL_ROUND_LIMIT,
  Number(process.env.MARKETING_EDITORIAL_LIFETIME_ROUNDS || EDITORIAL_ROUND_LIMIT),
);

/**
 * B718 — оба рубежа наружу одной функцией: прогон обязан мерить их ОТНОШЕНИЕ,
 * а не два числа по отдельности. «Пожизненный круг равен кругу за проход» —
 * это и есть правило «второй круг не оплачивается», и записать его надо там,
 * где его нельзя случайно разъединить.
 */
export function marketingEditorialRoundLimits(): { perPass: number; lifetime: number } {
  return { perPass: EDITORIAL_ROUND_LIMIT, lifetime: EDITORIAL_LIFETIME_ROUND_LIMIT };
}
const REVIEW_SCORE_KEYS = [
  "relevance",
  "value",
  "authenticity",
  "safety",
  "platformFit",
  "completeness",
  "language",
  "cta",
  "visual",
  "antiSlop",
] as const;
/** Only replies carry a conversational register, so it is scored separately. */
const COMMENT_REVIEW_SCORE_KEY = "toneFit";

function jsonObject<T>(raw: string): T {
  const unfenced = raw.trim()
    // Reasoning models in the free pool (Qwen, GLM) prepend a visible thinking
    // block. It is not part of the answer and its braces would corrupt the
    // brace-matching below.
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/i, "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const firstBrace = unfenced.indexOf("{");
  const lastBrace = unfenced.lastIndexOf("}");
  const candidate = firstBrace >= 0 && lastBrace > firstBrace
    ? unfenced.slice(firstBrace, lastBrace + 1)
    : unfenced;
  return JSON.parse(candidate) as T;
}

function jsonStringField(rawInput: string, field: string) {
  const raw = rawInput
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/i, "");
  const marker = `"${field}"`;
  const markerIndex = raw.indexOf(marker);
  if (markerIndex < 0) return null;
  const colonIndex = raw.indexOf(":", markerIndex + marker.length);
  const quoteIndex = raw.indexOf('"', colonIndex + 1);
  if (colonIndex < 0 || quoteIndex < 0) return null;
  let escaped = false;
  let value = "";
  for (let index = quoteIndex + 1; index < raw.length; index += 1) {
    const char = raw[index];
    if (escaped) {
      value += char === "n" ? "\n" : char === "t" ? "\t" : char;
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
    } else if (char === '"') {
      return value.trim();
    } else {
      value += char;
    }
  }
  return value.trim();
}

/**
 * B705 — поле контракта, объявленное строкой, обязано БЫТЬ строкой.
 *
 * Замер прода 2026-08-16: два материала (instagram 01.08, vk 30.07) умерли с
 * `archive_reason = "input.draft.mediaBrief?.trim is not a function"`. Модель
 * вернула валидный JSON, в котором `mediaBrief` был объектом вида
 * `{"idea": "…"}`, а не строкой; `jsonObject` разобрал его без единой жалобы,
 * потому что проверял разбор, а не форму. Первая же `.trim()` уронила проход
 * TypeError'ом, и материал получил приговор «не подлежит повтору» за ошибку
 * НАШЕГО кода.
 *
 * Запасная ветка `writerObject` (разбор из прозы) от этого была защищена
 * случайно: `jsonStringField` всегда возвращает строку. Защищена оказалась
 * только та ветка, которая срабатывает реже.
 */
function contractString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function contractStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(contractString).filter(Boolean);
}

function normalizeWriterOutput(value: WriterOutput, fallbackTitle: string): WriterOutput {
  return {
    ...value,
    title: contractString(value.title) || fallbackTitle,
    text: contractString(value.text),
    audienceNeed: contractString(value.audienceNeed),
    goal: contractString(value.goal),
    disclosure: contractString(value.disclosure),
    cta: contractString(value.cta),
    mediaBrief: contractString(value.mediaBrief),
    researchUsed: contractStringList(value.researchUsed),
    safetyFlags: contractStringList(value.safetyFlags),
  };
}

/**
 * Экспортируется ради теста: разбор ответа автора — граница системы, и
 * форма пришедшего с той стороны проверяется здесь, а не в вызывающем.
 */
export function writerObject(raw: string, fallbackTitle: string): WriterOutput {
  const guarded = (draft: WriterOutput): WriterOutput => {
    /*
     * B705 — ответ, который постом не является, снимает МАРШРУТ, а не материал.
     *
     * Бросок отсюда попадает в `parse` внутри `completeWithValidStructure`:
     * провайдер уходит из перебора, тот же запрос получает следующий. Прежде
     * английский лог рассуждений доезжал до редактора, стоил ему раунда и
     * убивал материал причиной, к материалу не относящейся (см.
     * `writer-output-guard.ts`, замер прода 2026-08-16).
     */
    const rejection = rejectNonPostWriterOutput(draft.text);
    if (rejection) {
      throw new Error(`writer returned no publishable post (${rejection.rule}): ${rejection.reason}`);
    }
    return draft;
  };
  try {
    return guarded(normalizeWriterOutput(jsonObject<WriterOutput>(raw), fallbackTitle));
  } catch (error) {
    // Отказ стража — это приговор ответу, а не повод разбирать его ещё раз
    // запасной веткой: она вернёт тот же текст, и он снова не будет постом.
    if (error instanceof Error && error.message.startsWith("writer returned no publishable post")) {
      throw error;
    }
    // Free routing pools occasionally return a valid draft wrapped in prose or
    // truncate the JSON after the `text` field. Preserve the model-written
    // copy, but never turn a short safety-classifier answer into a publication.
    const extractedText = jsonStringField(raw, "text");
    const plainText = raw.trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    const text = extractedText && extractedText.length >= 160
      ? extractedText
      : !plainText.includes('"text"') && plainText.length >= 240
        ? plainText
        : "";
    if (!text) throw new Error("writer returned invalid or incomplete structured output");
    return guarded({
      title: jsonStringField(raw, "title") || fallbackTitle,
      text,
      audienceNeed: jsonStringField(raw, "audienceNeed") || "саморефлексия",
      goal: jsonStringField(raw, "goal") || "полезный отклик аудитории",
      disclosure: jsonStringField(raw, "disclosure") || "",
      cta: jsonStringField(raw, "cta") || "",
      mediaBrief: jsonStringField(raw, "mediaBrief") || "",
      researchUsed: [],
      safetyFlags: [],
    });
  }
}

export function reviewerObject(raw: string, scoreKeys: readonly string[] = REVIEW_SCORE_KEYS): ReviewerOutput {
  const value = jsonObject<ReviewerOutput>(raw);
  if (!["APPROVE", "REVISE", "REJECT"].includes(value.decision)) {
    throw new Error("reviewer returned an unknown decision");
  }
  if (!value.scores || typeof value.scores !== "object") {
    throw new Error("reviewer omitted scorecard");
  }
  for (const key of scoreKeys) {
    const score = Number(value.scores[key]);
    if (!Number.isFinite(score) || score < 0 || score > 5) {
      throw new Error(`reviewer score ${key} is missing or outside 0..5`);
    }
  }
  if (!Array.isArray(value.issues) || !Array.isArray(value.revisionBrief)) {
    throw new Error("reviewer omitted issues or revision brief");
  }
  const revisedText = typeof value.revisedText === "string" ? value.revisedText.trim() : "";
  return {
    ...value,
    issues: value.issues.map(String).filter(Boolean),
    revisionBrief: value.revisionBrief.map(String).filter(Boolean),
    revisedText,
    summary: String(value.summary ?? ""),
  };
}

/**
 * B719 — рубеж свежести спрашивается только у бесплатного пула.
 *
 * Почему платный хвост из-под него выведен — в комментарии к
 * `marketingModelFreshnessApplies`: у скользящего псевдонима вроде
 * `yandexgpt/latest` даты выпуска нет и быть не может, а маршрут выбран
 * владельцем поимённо и ограничен деньгами, а не возрастом весов.
 */
function assertFreshMarketingModel(model: string, provider: AIProvider) {
  if (!marketingModelFreshnessApplies(provider)) return;
  const freshness = marketingModelFreshness(model);
  if (!freshness.eligible) {
    throw new Error(`model ${model} is ineligible: ${freshness.reason}`);
  }
}

/**
 * B623 — контрактные поля не зависят от послушности модели.
 *
 * Замер прода 2026-07-30: сразу после снятия потолка токенов (B622) выпуск
 * встал на двух отказах, которые система умеет исправить сама — автор не
 * вставил в текст обязательную ссылку и не заполнил CTA. Целевой адрес известен
 * из плана, поэтому он подставляется программно, а материал всё равно идёт
 * редактору — с явной пометкой, что́ дописала система.
 *
 * Браковать остаётся только то, чего взять негде: пустой текст, safety-флаг,
 * отсутствие адреса в плане и превышение лимита площадки уже ПОСЛЕ подстановки.
 */
export interface DraftRepair {
  field: "destinationUrl" | "cta" | "length" | "mediaBrief" | "emDash";
  note: string;
}

/**
 * B640 — нарушение лимита площадки перестало быть приговором.
 *
 * Раньше здесь стоял `throw`, и материал уезжал в `FAILED`/`ARCHIVED` прямо
 * на первом раунде: за неделю прод так выбросил 29 материалов и опубликовал
 * один. Но длина текста — не дефект замысла, а исполнимое замечание. Теперь
 * нарушения возвращаются наружу как замечания редактора: цикл отдаёт их автору
 * на доработку с точной цифрой перебора, и только если и после раундов не
 * уложились — система усекает текст сама, сохранив ссылку.
 *
 * Браковать остаётся то, чего взять негде: пустой текст, safety-флаг и
 * отсутствие адреса в плане.
 */
export function repairPublishableDraft(input: {
  draft: WriterOutput;
  isConversational: boolean;
  destinationUrl: string | null;
  platform: string;
  topic?: string | null;
  /**
   * Последний раунд: доработки больше не будет, поэтому нарушения лечатся
   * детерминированно здесь и сейчас, а не возвращаются наружу.
   */
  finalRound?: boolean;
  /**
   * B706 ступень 1 — контракт площадки с наложенными переопределениями из
   * `platform_settings`. Не передан — берётся значение из кода.
   */
  contract?: PlatformContract;
}): {
  draft: WriterOutput;
  repairs: DraftRepair[];
  violations: LimitViolation[];
  /**
   * B705 — замечания контракта, НЕ отменяющие вызов редактора.
   *
   * Разведены с `violations` намеренно, и цена смешения измерена тестом B700:
   * любое `violation` отменяет раунд редактора и возвращает материал автору.
   * Для длины и пустого mediaBrief это верно — оценивать нечего, пока текст
   * физически не влезает в площадку. Для «нет конкретного якоря» или лишнего
   * эмодзи — нет: материал оценим, и второй прогон автора за такое стоит
   * дороже, чем дефект.
   *
   * Поэтому они едут ВМЕСТЕ с материалом к редактору как уже найденное
   * машиной, а не вместо него. Редактор не тратит на них внимание и не
   * выдаёт их своими словами третий раз подряд.
   */
  contractDefects: LimitViolation[];
} {
  const text = input.draft.text?.trim() ?? "";
  if (!text || (input.draft.safetyFlags?.length ?? 0) > 0) {
    throw new Error(`writer safety block: ${(input.draft.safetyFlags ?? []).join(", ") || "empty text"}`);
  }
  if (input.isConversational) {
    return { draft: { ...input.draft, text }, repairs: [], violations: [], contractDefects: [] };
  }
  if (!input.destinationUrl) {
    throw new Error("owned publication has no destination URL in the plan");
  }

  const repairs: DraftRepair[] = [];
  let repairedText = text;
  let cta = input.draft.cta?.trim() ?? "";

  /**
   * B700 фаза 6 — система больше НЕ выдумывает призыв за автора.
   *
   * Было: пустой `cta` заполнялся строкой «Открыть по ссылке в тексте: <url>»,
   * а в конец текста приклеивался голый адрес. Проверка «CTA есть» после этого
   * проходила всегда — то есть система создавала видимость призыва там, где его
   * не написал никто. Замер прода 2026-08-09: шесть материалов из семи
   * заканчивались голой ссылкой.
   *
   * Теперь пустой призыв — это ЗАМЕЧАНИЕ редактора (`kind: "cta"`), которое
   * автор обязан устранить словами. Система вмешивается только на последнем
   * раунде и пишет призыв фразой, а не адресом: выпустить материал без призыва
   * хуже, чем выпустить его с типовым, но осмысленным.
   */
  if (!repairedText.includes(input.destinationUrl)) {
    // Ссылка приезжает вместе с призывом, а не отдельной голой строкой: хвост
    // «…текст.\n\nhttps://…» и был тем, что владелец назвал браком выпуска.
    const invitation = ctaWordsOf(cta) >= CTA_MIN_WORDS
      ? cta.replace(input.destinationUrl, "").trim().replace(/[:\s]+$/u, "")
      : "";
    repairedText = invitation
      ? `${repairedText}\n\n${invitation}: ${input.destinationUrl}`
      : `${repairedText}\n\n${input.destinationUrl}`;
    repairs.push({
      field: "destinationUrl",
      note: invitation
        ? `Ссылку из плана дописала система вместе с призывом автора: ${input.destinationUrl}`
        : `Ссылку из плана дописала система: ${input.destinationUrl}`,
    });
  }

  let mediaBrief = input.draft.mediaBrief?.trim() ?? "";

  /**
   * B700 фаза 6 — призыв словами это часть контракта материала, а не лимит
   * площадки, поэтому проверка живёт здесь, а не в `draftLimitViolations`.
   * Требование одинаково для всех площадок и приходит от продукта, а не от API.
   */
  const ctaViolations: LimitViolation[] = ctaWordsOf(cta) >= CTA_MIN_WORDS ? [] : [{
    kind: "cta",
    issue: ctaWordsOf(cta) === 0
      ? "В материале нет призыва словами: поле cta пустое или содержит только ссылку."
      : "Призыв — это не подпись к ссылке: в поле cta одно слово рядом с адресом, и читатель не понимает, что он получит.",
    brief: "Напиши CTA словами: что конкретно человек получит, перейдя по ссылке, — одно предложение без обещаний результата и без давления.",
  }];

  /**
   * Призыв чинится ПЕРВЫМ и только на последнем раунде: он добавляет текст, и
   * усечение по лимиту площадки обязано считать длину уже вместе с ним. Иначе
   * материал уезжает за предел ровно тем, чем его чинили.
   */
  if (ctaViolations.length > 0 && input.finalRound) {
    cta = fallbackCta(input.topic ?? input.draft.title ?? null);
    repairedText = repairedText.replace(`\n\n${input.destinationUrl}`, "").trimEnd();
    repairedText = `${repairedText}\n\n${cta}: ${input.destinationUrl}`;
    repairs.push({
      field: "cta",
      note: "Призыв написала система: автор не назвал действие словами и после доработок.",
    });
  }

  /**
   * B713 §2 — ДЛИНУ СНИМАЕТ КОД, И СНИМАЕТ НА КАЖДОМ РАУНДЕ.
   *
   * Требование владельца 2026-08-17 дословно: «убедись что лимит по символам
   * будет именно у автора (иначе это снова превратится в бесконечный круг)».
   *
   * Было: усечение стояло НИЖЕ, за условием `input.finalRound`. На первом и
   * втором раунде материал уходил редактору как есть, тот честно писал «Text
   * is 5222 chars, limit is 900», автор получал задание сократить — и не мог,
   * потому что модель не умеет считать символы даже после прямого запрета
   * (замер прода: 5240 при лимите 1000 после ДВУХ раундов правки). Круг
   * повторялся до исчерпания раундов: 27 смертей за две недели, и каждая
   * стоила круга автора И круга редактора.
   *
   * Стало: усечение выполняется до того, как считаются замечания. Редактор
   * физически не может увидеть текст длиннее лимита, значит не может потратить
   * на него раунд. Это ровно граница `draft-inspection`: что считает регулярка,
   * редактор считать не должен.
   *
   * ⚠ МЕСТО ВЫБРАНО НЕ СЛУЧАЙНО — ПОСЛЕ ПОЧИНКИ ПРИЗЫВА. Призыв добавляет
   * текст, и мерить длину надо уже вместе с ним, иначе материал уезжает за
   * предел ровно тем, чем его чинили.
   */
  const lengthLimits = platformPublishLimits(input.platform, input.contract);
  if (lengthLimits.textLimit !== null && repairedText.length > lengthLimits.textLimit) {
    const before = repairedText.length;
    repairedText = trimToLimit({
      text: repairedText,
      limit: lengthLimits.textLimit,
      mustKeep: input.destinationUrl,
    });
    /*
     * B705 §23 — записка обязана описывать состояние ПОСЛЕ починки.
     *
     * Прежняя формулировка называла только число «до» («не уложился в 480
     * (718)»), редактор следующего раунда читал 718 как длину сейчас и
     * возвращал материал на правку несуществующего дефекта.
     */
    repairs.push({
      field: "length",
      note: `Длину привела в норму система: было ${before} символов при пределе `
        + `${lengthLimits.textLimit}, стало ${repairedText.length}. Текст усечён по границе `
        + `предложения, ссылка сохранена. Длина сейчас в пределах площадки.`,
    });
  }

  /*
   * B705 — весь остальной контракт площадки, посчитанный без вызова модели.
   *
   * Три правила исключены намеренно: длину и визуальную идею уже считает
   * `draftLimitViolations`, а призыв — `ctaViolations` выше, и у обоих есть
   * готовая починка на последнем раунде. Дублировать их значило бы выдать
   * автору одно и то же замечание дважды разными словами — ровно то, из-за
   * чего раунды правки переставали сходиться (B700).
   */
  const inspectionExcluded = new Set(["length-over", "length-under", "media-brief-missing", "cta-missing"]);
  const contractViolations: LimitViolation[] = inspectDraft({
    platform: input.platform,
    title: input.draft.title ?? "",
    text: repairedText,
    cta,
    mediaBrief,
    destinationUrl: input.destinationUrl,
  }, input.contract)
    .filter((defect) => !inspectionExcluded.has(defect.rule))
    .map((defect) => ({ kind: "contract" as const, rule: defect.rule, issue: defect.issue, brief: defect.brief }));

  const violations = [
    ...(input.finalRound ? [] : ctaViolations),
    ...draftLimitViolations({
      platform: input.platform,
      text: repairedText,
      mediaBrief,
      overrideContract: input.contract,
    }),
  ];

  if (violations.length === 0 || !input.finalRound) {
    return {
      draft: { ...input.draft, text: repairedText, cta, mediaBrief },
      repairs,
      violations,
      contractDefects: contractViolations,
    };
  }

  /*
   * B713 §2: ветки длины здесь больше нет — усечение выполнено ВЫШЕ и на
   * каждом раунде, поэтому до этого места замечание `length` дойти не может.
   * Оставлять её дублем значило бы держать два места, где режется длина, и
   * ждать, пока они разойдутся.
   */
  for (const violation of violations) {
    if (violation.kind === "media-brief") {
      mediaBrief = fallbackMediaBrief({ title: input.draft.title ?? "", topic: input.topic });
      repairs.push({
        field: "mediaBrief",
        note: "Визуальную идею подставила система: автор оставил поле пустым и после доработок.",
      });
    }
  }

  /*
   * B705 — тире чинится детерминированно, остальной контракт не чинится вовсе.
   *
   * Из всех контрактных замечаний машинно исправимо ровно одно: заменить «—»,
   * «–» и «--» на обычный дефис. Это подстановка символа, она не может ни
   * изменить смысл, ни сломать предложение, и она снимает самый заметный
   * признак машинного текста — тот, из-за которого правило и заведено
   * (поправка владельца 2026-08-12: символа «—» нет на клавиатуре).
   *
   * Штампы, симметрию абзацев и отсутствие конкретного якоря система чинить не
   * пытается: переписывать текст за автора на последнем раунде — это то самое
   * «полная переработка вместо правки», которое B700 уже измерил и запретил.
   * Такой материал выходит как есть, а замечание остаётся в карточке.
   */
  const contract = input.contract ?? platformContract(input.platform);
  if (!contract.emDashAllowed && /[—–]|(?<=\s)--(?=\s)/u.test(repairedText)) {
    repairedText = repairedText.replace(/\s*[—–]\s*|\s+--\s+/gu, " - ");
    repairs.push({
      field: "emDash",
      note: "Длинные тире заменила система на обычный дефис: на клавиатуре символа «—» нет, и он выдаёт машинный текст.",
    });
  }

  return {
    draft: { ...input.draft, text: repairedText, cta, mediaBrief },
    repairs,
    violations: [],
    contractDefects: [],
  };
}

/**
 * B724 — взвешенный гейт допуска.
 * Заменяет требование «>= 4 по всем 10 критериям» на взвешенную сумму >= 35 из 50
 * при условии, что критические критерии (safety, authenticity, relevance) >= 4.
 * Субъективная тройка (например antiSlop: 3 или cta: 3) больше не блокирует публикацию.
 */
export function approvedByScorecard(
  review: ReviewerOutput,
  scoreKeys: readonly string[] = REVIEW_SCORE_KEYS,
): boolean {
  if (review.decision === "REJECT") return false;
  const evaluation = calculateWeightedScore(review.scores, scoreKeys);

  // Если редактор дал revisedText и критические критерии выполнены —
  // пост одобряется в однопроходном режиме без повторного вызова автора.
  if (review.revisedText?.trim() && evaluation.criticalPassed) {
    return true;
  }

  if (!evaluation.passed) return false;

  if (review.decision === "APPROVE") {
    return true;
  }

  return false;
}

type MarketingAgentFeature =
  | "marketing-agent-writer"
  | "marketing-agent-reviewer"
  | "marketing-reply-writer"
  | "marketing-reply-reviewer";

async function completeWithValidStructure<T>(input: {
  feature: MarketingAgentFeature;
  providerOrder: ReturnType<typeof marketingProviderOrder>;
  maxTokens: number;
  temperature: number;
  requestId: string;
  messages: Parameters<typeof aiComplete>[0]["messages"];
  parse: (raw: string) => T;
  /**
   * B623: модель, которой роль пользоваться не имеет права. Редактор обязан
   * отличаться от автора не провайдером, а именно моделью: один провайдер может
   * отдать обеим ролям одну и ту же модель, и тогда «независимая проверка»
   * перестаёт быть независимой.
   */
  excludeModel?: string | null;
  /**
   * B680 — общий на весь материал счётчик обращений к моделям. Один и тот же
   * объект передаётся обеим ролям и всем раундам: рубеж имеет смысл только
   * тогда, когда он считает материал целиком, а не каждый вызов по отдельности.
   */
  attempts?: { used: number };
  /**
   * B719 — сколько денег осталось сегодня у платного маршрута, в валюте его
   * счёта. Ключ есть только у платных провайдеров: у бесплатного остатка нет
   * не потому, что он большой, а потому, что вопрос к нему неприменим.
   */
  paidRemaining?: Map<AIProvider, number>;
  /**
   * B718 — сюда складываются провайдеры, отказавшие ПО ЁМКОСТИ. Множество
   * общее на весь материал, поэтому следующий раунд правки уже не спрашивает
   * их снова: квота не восстанавливается за те секунды, что идёт раунд.
   */
  capacityRefused?: Set<AIProvider>;
}) {
  const failures: string[] = [];
  let capacityFailures = 0;
  let separationFailures = 0;
  // B695: сколько маршрутов упёрлось в НАШ потолок вывода и сколько отвалилось
  // по состоянию дороги. Оба счёта нужны в конце: если весь перебор состоял из
  // них, материал ждёт следующего прохода, а не бракуется.
  let truncationFailures = 0;
  let infrastructureFailures = 0;
  // B705: сколько маршрутов вернули не пост (лог рассуждений, заглушку,
  // английский текст). Считается отдельно по той же причине, что и обрыв: если
  // ИМ состоял весь перебор, отвечали модели, а не материал.
  let nonPostFailures = 0;
  // B644: бюджет вывода живёт внутри прохода. Обрыв по лимиту — не отказ
  // маршрута, а нехватка нашего же бюджета, и лечится он одним способом:
  // повторить ТЕМ ЖЕ маршрутом с большим потолком. Перебор провайдеров здесь
  // только сжигал бы ёмкость на воспроизведение одного и того же обрыва.
  let budget = input.maxTokens;
  let truncationRetries = 0;
  const queue = [...input.providerOrder];
  while (queue.length > 0) {
    const provider = queue[0];
    let retrySameProvider = false;
    if (input.attempts) {
      const attemptLimit = maxStructuredAttemptsPerMaterial();
      if (input.attempts.used >= attemptLimit) {
        throw new MarketingAttemptBudgetError(
          `Материал израсходовал ${input.attempts.used} обращений к моделям за проход `
          + `(предел ${attemptLimit}) и остаётся черновиком. `
          + `Последние отказы: ${failures.slice(-3).join("; ") || "нет"}`,
        );
      }
      input.attempts.used += 1;
    }
    try {
      /**
       * B719 — выключатель размышления ставится ПЕРЕД собственным системным
       * сообщением роли и только там, где он у семейства весов есть.
       *
       * Порядок важен: директива должна прочитаться раньше правил площадки,
       * иначе модель успевает начать «думать» о задании. Провайдеру без
       * известного выключателя не подставляется ничего — строка наугад
       * засоряла бы промт, за который мы платим токенами.
       */
      /**
       * B719 — платному маршруту потолок вывода урезается по остатку суток.
       *
       * Проверка «есть ли ещё бюджет» стоит перед перебором и отвечает на
       * вопрос «можно ли вообще»; здесь отвечается второй, не менее важный —
       * «сколько можно за ЭТО обращение». Без него первый же вызов с потолком
       * 16 000 токенов перекрыл бы весь суточный лимит OpenAI вдвое.
       *
       * Длина промта оценивается по символам (≈3 символа на токен для
       * русского текста) и намеренно с запасом вверх: завышенная оценка
       * промта оставляет меньше на вывод, то есть ошибается в сторону
       * экономии, а не перерасхода.
       */
      const paidRemaining = input.paidRemaining?.get(provider);
      let callBudget = budget;
      if (paidRemaining !== undefined) {
        const promptChars = input.messages.reduce((sum, message) => sum + message.content.length, 0);
        callBudget = paidRouteMaxOutputTokens({
          provider,
          remaining: paidRemaining,
          promptTokens: Math.ceil(promptChars / 3),
          ceiling: budget,
        });
        if (callBudget <= 0) {
          failures.push(`${provider}: суточный потолок расхода не покрывает даже промт`);
          queue.shift();
          continue;
        }
      }
      const suppression = marketingReasoningSuppression({ feature: input.feature, provider });
      const messages = suppression
        ? [{ role: "system" as const, content: suppression }, ...input.messages]
        : input.messages;
      const response = await aiComplete({
        feature: input.feature,
        dataClass: "PUBLIC_MARKETING",
        providerOrder: [provider],
        maxTokens: callBudget,
        temperature: input.temperature,
        requestId: `${input.requestId}:${provider.toLowerCase()}`
          + (truncationRetries > 0 ? `:b${truncationRetries}` : ""),
        messages,
      });
      /**
       * B719 — платный маршрут списывается СРАЗУ ПОСЛЕ ОТВЕТА, до любых
       * проверок пригодности.
       *
       * Провайдер берёт деньги за отданные токены, а не за то, понравился ли
       * нам ответ: обрезанный по лимиту вывода вердикт оплачен полностью.
       * Списывать после разбора значило бы вести суточный потолок по одним
       * удачам и не заметить сутки, целиком ушедшие в брак.
       *
       * Сбой записи расхода не имеет права уронить материал (правило «побочное
       * действие вне try основной операции»), но и промолчать не должен:
       * непосчитанный расход — это дырка в потолке, и о ней надо знать.
       */
      void recordPaidRouteSpend({
        provider,
        promptTokens: response.tokensIn,
        completionTokens: response.tokensOut,
      }).catch((error) => {
        log.warn("marketing-agent.paid-route-spend-not-recorded", {
          provider,
          feature: input.feature,
          error: serializeError(error),
        });
      });
      assertFreshMarketingModel(response.model, provider);
      if (input.excludeModel && response.model === input.excludeModel) {
        separationFailures += 1;
        failures.push(`${provider}: resolved to the writer's model ${response.model}`);
        queue.shift();
        continue;
      }
      try {
        return { response, value: input.parse(response.text) };
      } catch (error) {
        // B644: сначала спрашиваем, ДОПИСАН ли ответ вовсе. Неразобранный
        // обрывок — это не брак структуры, а недосказанное предложение.
        if (isTruncatedCompletion(response.finishReason)) {
          const nextBudget = Math.min(
            MARKETING_MAX_STRUCTURED_OUTPUT_TOKENS,
            Math.ceil(budget * TRUNCATION_BUDGET_FACTOR),
          );
          if (nextBudget <= budget) {
            throw new MarketingTruncatedOutputError(
              `Ответ модели ${response.model} (${provider}) обрезан по лимиту вывода `
              + `${budget} токенов (finishReason=${response.finishReason}). Провайдер исправен: `
              + "бюджета не хватило на размышление и ответ одновременно.",
            );
          }
          log.warn("marketing-agent.output-truncated", {
            feature: input.feature,
            provider,
            model: response.model,
            finishReason: response.finishReason,
            budget,
            nextBudget,
          });
          budget = nextBudget;
          truncationRetries += 1;
          retrySameProvider = true;
        } else {
          const message = error instanceof Error ? error.message : String(error);
          if (message.startsWith("writer returned no publishable post")) nonPostFailures += 1;
          failures.push(`${provider}: ${message}`);
          log.warn("marketing-agent.invalid-structured-output", {
            feature: input.feature,
            provider,
            model: response.model,
          });
        }
      }
    } catch (error) {
      /**
       * B695 — обрыв по потолку снимает с перебора ЭТУ модель, а не весь проход.
       *
       * B644 останавливал здесь проход целиком, полагая, что «остальные
       * маршруты вернут тот же оборванный ответ за ту же ёмкость». Замер прода
       * 2026-08-06 это опроверг: обрывается ДУМАЮЩАЯ модель (размышление идёт
       * из того же бюджета и в `completion_tokens` не видно), а `mistral-small`
       * в той же очереди отвечает в свои 4000 без обрыва. Цена прежнего вывода —
       * девять слотов контент-плана, сгоревших на одной модели OpenRouter.
       *
       * Ступень бюджета при этом сбрасывается: следующая модель начинает со
       * своего стартового лимита, а не с чужого потолка — иначе один думающий
       * маршрут задирал бы расход всем остальным.
       */
      if (error instanceof MarketingTruncatedOutputError) {
        truncationFailures += 1;
        failures.push(`${provider}: ${error.message}`);
        budget = input.maxTokens;
        truncationRetries = 0;
        queue.shift();
        continue;
      }
      if (isCapacityError(error)) {
        capacityFailures += 1;
        // B718: отказ по ёмкости помнится до конца материала — см. объявление
        // `capacityRefused` в `runMaterial`.
        input.capacityRefused?.add(provider);
      } else if (isInfrastructureRoutingError(error)) infrastructureFailures += 1;
      failures.push(`${provider}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!retrySameProvider) queue.shift();
  }
  const summary = failures.join("; ");
  // Кончилась ёмкость — это не брак материала. Отличаем, чтобы не сжечь
  // публикацию навсегда там, где достаточно попробовать позже.
  if (capacityFailures > 0 && capacityFailures === failures.length) {
    throw new MarketingCapacityError(`Не осталось свободной ёмкости провайдеров (${summary})`);
  }
  // B623: то же и для сузившегося пула. Единственная живая модель уже занята
  // автором — материал ждёт вторую, а не отбраковывается.
  if (separationFailures > 0 && separationFailures + capacityFailures === failures.length) {
    throw new MarketingModelSeparationError(
      `В пуле не осталось модели, отличной от модели автора (${summary})`,
    );
  }
  // B695: весь перебор упёрся в наш потолок вывода. Это одна причина с одним
  // лечением — другая модель на следующем проходе, — и материал тут ни при чём.
  if (truncationFailures > 0
    && truncationFailures + capacityFailures + separationFailures === failures.length) {
    throw new MarketingTruncatedOutputError(
      `Все маршруты обрезаны по лимиту вывода: думающие модели тратят бюджет на `
      + `размышление. Материал ждёт следующего прохода (${summary})`,
    );
  }
  // B695: перебор состоял из отказов дороги. Ждать здесь честнее, чем браковать
  // текст: ни один код ничего не сказал о материале.
  if (infrastructureFailures > 0
    && infrastructureFailures + truncationFailures + capacityFailures + separationFailures
      === failures.length) {
    throw new MarketingInfrastructureError(
      `Маршруты отвечали отказом дороги, а не по существу материала (${summary})`,
    );
  }
  // B705: постом не оказался ни один ответ перебора. Тема, план и промт у всех
  // маршрутов были одни и те же — значит отвечали модели, а не материал, и
  // приговор «не подлежит повтору» здесь был бы неправдой.
  if (nonPostFailures > 0
    && nonPostFailures + infrastructureFailures + truncationFailures + capacityFailures
      + separationFailures === failures.length) {
    throw new MarketingWriterGarbageError(
      `Ни один маршрут не вернул текст поста: модели отвечали логом рассуждений, `
      + `заглушкой или не по-русски. Материал ждёт следующего прохода (${summary})`,
    );
  }
  throw new Error(`No free provider returned valid structured output (${summary})`);
}

function safePlatform(value: string) {
  const normalized = value.trim().toLowerCase();
  return ["vk", "telegram", "reddit", "threads", "instagram", "dzen"].includes(normalized)
    ? normalized
    : "other";
}

export async function marketingAgentEnabled(): Promise<boolean> {
  if (
    process.env.ETERAPY_CONTOUR?.trim().toLowerCase() === "staging"
    && process.env.MARKETING_AGENT_ALLOW_STAGING !== "true"
  ) {
    return false;
  }
  const setting = await db.platformSetting.findUnique({
    where: { key: "marketing.agent.enabled" },
    select: { value: true },
  }).catch(() => null);
  if (setting) return setting.value === "true" || setting.value === "1";
  return process.env.MARKETING_AGENT_ENABLED === "true"
    || process.env.MARKETING_AGENT_ENABLED === "1";
}

async function recordSignal(input: {
  key: string;
  kind: string;
  severity: "INFO" | "WARNING" | "INCIDENT";
  title: string;
  summary: string;
  evidence?: Prisma.InputJsonValue;
}) {
  return db.marketingAutomationSignal.upsert({
    where: { key: input.key },
    create: {
      ...input,
      suggestedTicket: input.severity === "INCIDENT" ? "INC" : "B",
    },
    update: {
      kind: input.kind,
      severity: input.severity,
      status: "OPEN",
      title: input.title,
      summary: input.summary,
      evidence: input.evidence,
      lastSeenAt: new Date(),
      resolvedAt: null,
    },
  });
}

/** Кто именно отработал роль. Провайдер и модель — всё, что нужно снаружи. */
interface RoleStamp {
  provider: string;
  model: string;
}

interface EditorialIteration {
  round: number;
  writer: RoleStamp;
  candidate: WriterOutput;
  /** B623: что дописала система за автора — видно и редактору, и в кокпите. */
  repairs: DraftRepair[];
  reviewer: RoleStamp;
  review: ReviewerOutput;
  /**
   * B705 §23: замечания редактора о свойствах, которые машина уже посчитала
   * годными. Решение изменено не молча — в карточке видно, что именно снято.
   */
  machineOverruled?: { issue: string; family: string }[];
}

/**
 * B700 — незавершённое производство на строке реестра.
 *
 * Автор и редактор это две операции конвейера, и между ними материал обязан
 * лежать на складе, а не в памяти процесса. Раньше готовый текст автора жил в
 * локальной переменной: отказ редактора по 429 уносил его вместе с исключением,
 * и следующий проход платил за ту же работу заново. Замер прода 2026-08-09 — 88
 * успешных генераций автора за сутки при нуле публикаций.
 *
 * Здесь лежит ровно то, что нужно, чтобы продолжить с места остановки:
 * написанное, история раундов и уже собранная справка. Справка переносится не
 * ради экономии — ради воспроизводимости: редактор должен смотреть тот же
 * материал, который писал автор.
 */
interface CarriedWriterStage {
  /** Раунд, с которого продолжает следующий проход. */
  round: number;
  /**
   * B700 фаза 6 (страховка) — сколько раундов материал прошёл ЗА ВСЮ ЖИЗНЬ.
   *
   * Отдельно от `round`, потому что `round` обнуляется, когда исчерпанный круг
   * возвращается на склад вместо архива. Без пожизненного счётчика возврат
   * означал бы вечный круг: редактор пишет «поправимо», материал уходит на
   * доработку, и так до конца бюджета обращений.
   */
  lifetimeRounds: number;
  research: unknown;
  iterationHistory: EditorialIteration[];
  previousDraft: WriterOutput | null;
  previousReview: ReviewerOutput | null;
  /**
   * Написанное и ждущее редактора. `null` означает, что раунд закончился
   * доработкой (перебор по длине площадки) и смотреть пока нечего.
   */
  pending: { draft: WriterOutput; repairs: DraftRepair[]; writer: RoleStamp } | null;
}

/**
 * Разбор склада. Мусор в колонке не должен ронять материал: непонятная стадия
 * означает «начинаем сначала», а не «строка мертва». Цена ошибки несимметрична
 * — лишняя генерация против навсегда застрявшей строки.
 */
export function carriedWriterStage(value: unknown): CarriedWriterStage | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const round = typeof raw.round === "number" && raw.round >= 1 ? raw.round : null;
  if (!round || !Array.isArray(raw.iterationHistory)) return null;
  const pending = raw.pending && typeof raw.pending === "object"
    ? raw.pending as CarriedWriterStage["pending"]
    : null;
  // Ни написанного, ни истории правки — продолжать нечего.
  if (!pending?.draft?.text && !raw.previousDraft) return null;
  return {
    round,
    // Склад, записанный до появления счётчика, начинает счёт со своего раунда:
    // это ошибка в консервативную сторону — материал получит не больше кругов,
    // чем положено, а не меньше.
    lifetimeRounds: typeof raw.lifetimeRounds === "number" && raw.lifetimeRounds >= round
      ? raw.lifetimeRounds
      : round,
    research: raw.research ?? null,
    iterationHistory: raw.iterationHistory as EditorialIteration[],
    previousDraft: (raw.previousDraft as WriterOutput | null) ?? null,
    previousReview: (raw.previousReview as ReviewerOutput | null) ?? null,
    pending,
  };
}

export async function processMarketingDraft(publicationId: string) {
  const publication = await db.externalPublication.findUnique({
    where: { id: publicationId },
  });
  if (!publication || !["DRAFT", "REVIEW"].includes(publication.status)) {
    return { status: "skipped" as const };
  }

  // B618: ответ на входящее — такой же разговорный материал, как комментарий:
  // свой регистр, отдельная оценка тона, обязательная премодерация человеком.
  const isInboundReply = publication.contentType === INBOUND_REPLY_CONTENT_TYPE;
  const isConversational = isConversationalContentType(publication.contentType);
  const platform = safePlatform(publication.platform);
  const contract = await resolvePlatformContract(platform);
  const tone = isConversational ? engagementToneById(publication.engagementTone) : null;
  const scoreKeys = isConversational
    ? [...REVIEW_SCORE_KEYS, COMMENT_REVIEW_SCORE_KEY]
    : REVIEW_SCORE_KEYS;

  let parsedNotes: {
    format?: string;
    editorialAngle?: string;
    outline?: string[];
    keyPoints?: string[];
    /** B733 — требования формата: они сильнее общей рубрики редактора. */
    formatRules?: string[];
    formatMedia?: "none" | "chat_mockup" | "art";
  } | null = null;
  if (publication.notes) {
    try {
      parsedNotes = JSON.parse(publication.notes);
    } catch {
      parsedNotes = null;
    }
  }

  // Public social content is part of the SMM task. Internal ETerapy user,
  // practitioner, dialogue, booking and session data is never attached here.
  // B640: разговор помнит, о чём он. Без этого каждое следующее сообщение
  // человека трактовалось как первое, а ответ на комментарий строился вслепую:
  // текста собственного поста в промпте не было вовсе.
  //
  // Отказ сборки памяти материал не убивает: ответ без истории хуже ответа с
  // историей, но несравнимо лучше несостоявшегося ответа. Причина при этом
  // остаётся в логе, а не растворяется.
  const conversation = isConversational
    ? await buildConversationMemory({
      inboundId: publication.inboundReplyToId,
      threadId: publication.engagementTargetId,
      platform,
    }).catch((error) => {
      log.warn("marketing.conversation_memory_failed", {
        publicationId: publication.id,
        error: serializeError(error),
      });
      return null;
    })
    : null;

  const task = {
    kind: isInboundReply ? "INBOUND_REPLY" : isConversational ? "COMMENT" : "OWNED_POST",
    platform,
    title: publication.title,
    topic: publication.cluster ?? publication.targetQuery ?? "саморефлексия",
    editorialBrief: publication.notes,
    format: parsedNotes?.format ?? null,
    editorialAngle: parsedNotes?.editorialAngle ?? null,
    outline: parsedNotes?.outline ?? null,
    keyPoints: parsedNotes?.keyPoints ?? null,
    // B733: требования ФОРМАТА уходят и автору, и редактору одним полем.
    // Пост-шутка не обязан нести пользу и призыв, и без этой строки редактор
    // режет его по общей рубрике — ровно это и делало ленту ровной.
    formatRules: parsedNotes?.formatRules ?? null,
    destinationUrl: isConversational ? null : publication.destinationUrl,
    // Для ответа на входящее это НАШ разговор: человек написал нам сам, и его
    // текст — адресат ответа, а не свидетельство спроса.
    inbound: isInboundReply ? {
      text: publication.engagementExcerpt,
      author: publication.engagementTargetLabel,
      url: publication.engagementTargetUrl,
    } : null,
    publicPost: isConversational && !isInboundReply ? {
      text: publication.engagementExcerpt,
      url: publication.engagementTargetUrl,
      label: publication.engagementTargetLabel,
      platformPostId: publication.engagementTargetId,
    } : null,
    scheduledFor: publication.scheduledFor?.toISOString() ?? null,
    revisionRequested: publication.status === "REVIEW",
    // Register is assigned by the engagement planner, not by the model, so the
    // mix of voices across a day stays observable and reproducible.
    tone: tone ? { id: tone.id, label: tone.label, brief: tone.brief } : null,
    toneHardLimits: isConversational ? ENGAGEMENT_TONE_HARD_LIMITS : null,
    // B640: точная цифра предела именно этой площадки — в задаче, а не только
    // абзацем в общем контракте. Абзац в контракте стоял всё время, пока прод
    // выдавал материал на 40% длиннее допустимого: общий текст читается как
    // пожелание, конкретное число в задаче — как требование.
    platformLimits: isConversational ? null : platformLimitsForPrompt(platform, contract),
    // Ветка разговора и наш пост, под которым он идёт. Это ДАННЫЕ: указания,
    // встретившиеся внутри чужих реплик, исполнять нельзя — то же правило, что
    // и для research.
    conversation: conversation && (conversation.thread.length > 1 || conversation.ourPost)
      ? conversation
      : null,
  };

  try {
    /**
     * B699 — вопрос «есть ли кому проверить» решается ДО вызова автора.
     *
     * Редактору нужна модель, отличная от модели автора. Когда в пуле остаётся
     * одна доступная модель, второй нет по построению — но раньше это
     * выяснялось уже после того, как автор отработал и списал токены. Замер
     * прода 2026-08-09: 88 успешных генераций автора за сутки, ноль
     * публикаций, и списывались они с того самого потолка, из-за которого
     * второй модели и не было. Нехватка кормила сама себя.
     *
     * Отказ здесь ёмкостный: строка остаётся черновиком и вернётся следующим
     * проходом, когда ключи остынут.
     */
    const availability = await marketingPoolAvailability();
    if (!availability.canSeparateRoles) {
      throw new MarketingCapacityError(
        availability.providers.length === 0
          ? "Не осталось свободной ёмкости провайдеров: все ключи остывают"
          : `В пуле не осталось второй независимой модели (доступны: ${availability.providers.join(", ")})`,
      );
    }

    const cycleSeed = `${publication.id}:${publication.attemptCount + 1}`;
    // B680: счётчик обращений к моделям на весь материал — общий для обеих
    // ролей и всех раундов правки.
    const attempts = { used: 0 };
    /**
     * B718 — ОТКАЗ ПО ЁМКОСТИ ПОМНИТСЯ ДО КОНЦА МАТЕРИАЛА.
     *
     * `marketingProviderOrder` строится заново на КАЖДОМ раунде, а голова
     * очереди по требованию владельца (B712) не вращается. Значит провайдер,
     * только что сказавший «квота кончилась», получает тот же вопрос в
     * следующем раунде — и отвечает то же самое.
     *
     * Замер прода 19–20.08 показывает цену: у Gemini 45 и 44 отказа 429 за
     * сутки при 38 и 25 успехах, а семь живых бесплатных провайдеров в те же
     * сутки не получили НИ ОДНОГО обращения автора. Пул из двенадцати работал
     * как пул из одного — ровно то, на что жалуется владелец словами «выжигаются
     * все лимиты бесплатных провайдеров». Выжигался один.
     *
     * Множество живёт ровно один проход материала: квота восстанавливается по
     * часам, и помнить отказ дольше значило бы вычеркнуть провайдера из пула
     * по одному 429. Предпочтение владельца не нарушено: голова спрашивается
     * первой — просто один раз, а не шесть.
     */
    const capacityRefused = new Set<AIProvider>();
    /**
     * B719 — платные маршруты, выбравшие суточный потолок расхода.
     *
     * Спрашивается один раз на материал, а не на каждом раунде: сутки за
     * время прохода не меняются, а лишний запрос к базе на каждом круге
     * правки — это та же лестница обращений, от которой лечил B718.
     *
     * Пусто, когда платный хвост выключен вовсе: считать потолки маршрута,
     * которого нет в очереди, незачем.
     */
    const paidBudget = await (async () => {
      if (!marketingPaidFallbackEnabled()) {
        return { over: [] as AIProvider[], remaining: new Map<AIProvider, number>() };
      }
      const states = await paidRouteBudgetStates().catch(() => []);
      const remaining = new Map(states.map((state) => [state.provider, state.remaining]));
      return {
        over: MARKETING_PAID_PROVIDERS.filter((provider) => (remaining.get(provider) ?? 0) <= 0),
        remaining,
      };
    })();
    const paidRoutesOverBudget = paidBudget.over;
    // B700: проход продолжает со склада, а не с чистого листа. Справка тоже
    // берётся оттуда — редактор обязан смотреть тот материал, который писал
    // автор, а не свежесобранный по тем же исходным данным.
    const carried = carriedWriterStage(publication.agentWriterDraft);
    const research = carried?.research ?? await buildMarketingResearchBrief(publication);
    const iterationHistory: EditorialIteration[] = carried ? [...carried.iterationHistory] : [];
    let approvedDraft: WriterOutput | null = null;
    /**
     * B713 §3 — заполняется, только когда материал выпущен БЕЗ полного
     * одобрения редактора. Владелец узнаёт об этом карточкой в маркетинговом
     * канале: «вышло с оставшимися замечаниями» и «вышло одобренным» не имеют
     * права выглядеть одинаково.
     */
    let releasedWithoutApproval: {
      round: number;
      score: number;
      outstandingIssues: string[];
    } | null = null;
    let lastWriter: RoleStamp | null = carried?.pending?.writer
      ?? carried?.iterationHistory.at(-1)?.writer
      ?? null;
    let lastReviewer: RoleStamp | null = null;
    let previousDraft: WriterOutput | null = carried?.previousDraft ?? null;
    let previousReview: ReviewerOutput | null = carried?.previousReview ?? null;
    /** Написанное со склада: первый раунд прохода отдаёт его редактору как есть. */
    let pending = carried?.pending ?? null;
    // B700 фаза 6 (страховка): счёт кругов за всю жизнь материала. Растёт вместе
    // с раундами и переживает возврат исчерпанного круга на склад.
    let lifetimeRounds = carried?.lifetimeRounds ?? (carried?.round ?? 1);

    /**
     * B700 — склад пишется ДО вызова редактора, а не после утверждения.
     *
     * Отдельной функцией, потому что вызывается из двух мест цикла и обязана
     * быть безобидной: сбой записи склада не должен убивать материал, который
     * уже написан. В худшем случае мы теряем экономию, а не работу.
     */
    const carry = async (stage: CarriedWriterStage) => {
      await db.externalPublication.update({
        where: { id: publication.id },
        data: {
          agentWriterDraft: stage as unknown as Prisma.InputJsonValue,
          agentWrittenAt: new Date(),
        },
      }).catch((error) => {
        log.warn("marketing.writer_stage_not_carried", {
          publicationId: publication.id,
          error: serializeError(error),
        });
      });
    };

    for (let round = carried?.round ?? 1; round <= EDITORIAL_ROUND_LIMIT; round += 1) {
      let writer: RoleStamp;
      let repaired: ReturnType<typeof repairPublishableDraft>;
      if (pending) {
        // B700: материал написан и оплачен прошлым проходом — он идёт прямо к
        // редактору. Требования площадки он тогда прошёл, иначе не попал бы на
        // склад: повторная проверка ничего не добавит.
        writer = pending.writer;
        repaired = { draft: pending.draft, repairs: pending.repairs, violations: [], contractDefects: [] };
        pending = null;
      } else {
      const pinnedWriterProvider: AIProvider | null = lastWriter
        ? marketingProviderFromLabel(lastWriter.provider)
        : null;
      // B700 фаза 6: раунд правки — это правка, а не новая версия. Правило
      // живёт в `marketingWriterPrompt` и проверяется тестом.
      const writerPrompt: Record<string, unknown> = marketingWriterPrompt({
        task,
        research,
        round,
        previousDraft,
        previousReview,
      });
      const writerResult: StructuredCompletion<WriterOutput> = await completeWithValidStructure({
        // B628: разговорный материал списывается с отдельной суточной ёмкости.
        feature: isConversational ? MARKETING_REPLY_WRITER_FEATURE : "marketing-agent-writer",
        providerOrder: pinnedWriterProvider
          ? [pinnedWriterProvider]
          // B699: обход только по ключам, которые сейчас не остывают.
          // B712: платный хвост подключается ТОЛЬКО автору и только по явному
          // разрешению — редактор судит, а не пишет, и платить за суждение
          // владелец не просил.
          : marketingProviderOrder(
            `writer:${cycleSeed}`,
            // B718: провайдеров, уже сказавших «квота кончилась» на этом
            // материале, второй раз не спрашиваем.
            [
              ...capacityRefused,
              // B719: платный маршрут, выбравший суточный потолок расхода,
              // исключается ровно так же, как исчерпавший квоту бесплатный —
              // через `excluded`. Отдельной ветки он не заслуживает: для
              // очереди это одно и то же состояние «сегодня уже нельзя».
              ...paidRoutesOverBudget,
            ],
            availability.providers,
            { paidFallback: marketingPaidFallbackEnabled(), role: "writer" },
          ),
        maxTokens: MARKETING_WRITER_MAX_TOKENS,
        temperature: 0.45,
        // B719: платный хвост доступен только автору, значит и остаток денег
        // нужен только здесь.
        paidRemaining: paidBudget.remaining,
        attempts,
        capacityRefused,
        requestId: `marketing-writer:${publication.id}:${publication.attemptCount + 1}:${round}`,
        messages: [
          // B705: автор получает контракт СВОЕЙ площадки и только его, а роль
          // выбирается по типу материала: пост пишет автор публикаций, ответ
          // человеку — SMM-собеседник. Прежде обе работы делал один промт.
          {
            role: "system",
            content: isConversational
              ? marketingSmmSystemPrompt(platform)
              : marketingWriterSystemPrompt(platform),
          },
          { role: "user", content: JSON.stringify(writerPrompt) },
        ],
        parse: (raw) => writerObject(raw, publication.title),
      });
      const completion: AICompletion = writerResult.response;
      writer = { provider: completion.provider, model: completion.model };
      repaired = repairPublishableDraft({
        draft: writerResult.value,
        isConversational,
        destinationUrl: publication.destinationUrl,
        platform,
        topic: publication.cluster ?? publication.targetQuery,
        finalRound: round === EDITORIAL_ROUND_LIMIT,
        contract,
      });
      }
      let { draft } = repaired;
      const { repairs, violations, contractDefects } = repaired;

      // B640: перебор по длине и пустой mediaBrief — исполнимое замечание, а не
      // приговор. Раньше здесь материал выбрасывался (`throw` → FAILED), и
      // независимый редактор его даже не видел: токены автора потрачены,
      // на площадку не вышло ничего. Теперь это обычный раунд доработки — с
      // точной цифрой перебора, а не «слишком длинно».
      //
      // Редактора на таком раунде не зовём намеренно: оценивать нечего, пока
      // материал физически не помещается в площадку, и второй вызов модели
      // здесь — трата суточной ёмкости впустую.
      if (violations.length > 0) {
        const limitReview: ReviewerOutput = {
          decision: "REVISE",
          scores: Object.fromEntries(scoreKeys.map((key) => [key, 0])),
          issues: violations.map((violation) => violation.issue),
          revisionBrief: violations.map((violation) => violation.brief),
          revisedText: "",
          summary: `Материал не проходит жёсткие требования площадки ${platform}.`,
        };
        iterationHistory.push({
          round,
          writer: { provider: writer.provider, model: writer.model },
          candidate: draft,
          repairs,
          // Проверку выполнила система, а не модель: в кокпите должно быть
          // видно, что это не мнение редактора, а измеримое требование.
          reviewer: { provider: "system", model: "platform-limits" },
          review: limitReview,
        });
        lastWriter = writer;
        previousDraft = draft;
        previousReview = limitReview;
        // B700: раунд ушёл на доработку — на склад ложится история, а не текст.
        // Иначе перезапуск воркера посреди правки вернул бы материал к первому
        // раунду и потерял бы уже названные замечания.
        await carry({
          round: round + 1,
          lifetimeRounds: lifetimeRounds + 1,
          research,
          iterationHistory,
          previousDraft,
          previousReview,
          pending: null,
        });
        lifetimeRounds += 1;
        continue;
      }

      // B700: написанное ложится на склад ДО вызова редактора. Это и есть
      // граница двух операций конвейера: дальше отказ редактора стоит одного
      // вызова редактора, а не повторной оплаты автора.
      await carry({
        round,
        lifetimeRounds,
        research,
        iterationHistory,
        previousDraft,
        previousReview,
        pending: { draft, repairs, writer },
      });

      // B623: редактор предпочитает другого провайдера, но окончательный
      // критерий — другая МОДЕЛЬ. Провайдер автора остаётся в конце очереди как
      // последний вариант: он допустим, если отдаст не ту же модель.
      const writerProvider = marketingProviderFromLabel(writer.provider);
      const rotated = marketingProviderOrder(
        `reviewer:${cycleSeed}`,
        [...capacityRefused],
        availability.providers,
        // B719: у редактора своя голова очереди — самая немногословная модель
        // пула. Платного хвоста у редактора нет и не было: платить за
        // суждение владелец не просил.
        { role: "reviewer" },
      );
      const reviewerProviderOrder = [
        ...rotated.filter((provider) => provider !== writerProvider),
        ...rotated.filter((provider) => provider === writerProvider),
      ];
      const reviewerResult = await completeWithValidStructure({
        feature: isConversational ? MARKETING_REPLY_REVIEWER_FEATURE : "marketing-agent-reviewer",
        providerOrder: reviewerProviderOrder,
        excludeModel: writer.model,
        maxTokens: MARKETING_REVIEWER_MAX_TOKENS,
        temperature: 0.05,
        attempts,
        capacityRefused,
        requestId: `marketing-reviewer:${publication.id}:${publication.attemptCount + 1}:${round}`,
        messages: [
          // B705: «нативность площадке» меряется по контракту той ленты, куда
          // материал выходит, а не по усреднённым правилам шести. Ответ
          // человеку судится по своим критериям: пост и реплика — разная работа.
          {
            role: "system",
            content: isConversational
              ? marketingSmmReviewerSystemPrompt(platform)
              : marketingReviewerSystemPrompt(platform),
          },
          {
            role: "user",
            // B700 фаза 6: редактор видит собственные замечания прошлого раунда
            // и проверяет сходимость, а не ищет свежие придирки.
            content: JSON.stringify(marketingReviewerPrompt({
              task,
              research,
              round,
              candidate: draft,
              systemRepairs: repairs,
              previousReview,
              // B705: то, что уже посчитала машина. Редактор не ищет это
              // заново и не выдаёт своими словами третий круг подряд.
              machineFindings: contractDefects,
              // B724: площадки без ссылок и CTA (Threads, Reddit)
              allowNoCta: contract.ctaPolicy === "discouraged"
                || contract.maxLinks === 0,
            })),
          },
        ],
        parse: (raw) => reviewerObject(raw, scoreKeys),
      });
      const reviewer: RoleStamp = {
        provider: reviewerResult.response.provider,
        model: reviewerResult.response.model,
      };
      if (writer.model === reviewer.model) {
        throw new MarketingModelSeparationError(
          `writer and reviewer resolved to the same model ${writer.model}`,
        );
      }
      /*
       * B705 §23 — считаемое свойство судит машина, и на выходе редактора тоже.
       *
       * Запрет мерить длину живёт в хартии редактора, но модель его игнорирует:
       * на проде она жаловалась на превышение лимита Threads при 417, 434 и 466
       * символах против предела 480, а число «718» списала из нашей же записки
       * о починке прошлого раунда. Сюда материал попадает только когда
       * `violations` пуст, то есть длина уже признана годной, — значит такое
       * замечание ложно по построению и снимается без спора.
       */
      const reconciled = reconcileReviewWithMachine({
        review: reviewerResult.value,
        machineDefectRules: contractDefects
          .map((defect) => defect.rule)
          .filter((rule): rule is string => Boolean(rule)),
      });
      const review = reconciled.review;
      if (reconciled.dropped.length > 0) {
        // Вычеркнутое видно в кокпите: это не молчаливая правка чужого решения,
        // а измеримое событие, по которому считается доля ложных замечаний.
        console.info(JSON.stringify({
          event: "marketing.review_machine_authority",
          publicationId: publication.id,
          platform,
          round,
          decision: review.decision,
          dropped: reconciled.dropped,
        }));
      }
      iterationHistory.push({
        round,
        writer: { provider: writer.provider, model: writer.model },
        candidate: draft,
        repairs,
        reviewer: { provider: reviewer.provider, model: reviewer.model },
        review,
        ...(reconciled.dropped.length > 0 ? { machineOverruled: reconciled.dropped } : {}),
      });
      lastWriter = writer;
      lastReviewer = reviewer;

      // B724: однопроходный инлайн-редактор. Если редактор вернул revisedText
      // и критические дефекты отсутствуют — принимаем исправленный текст сразу,
      // не сжигая раунды доработки между автором и редактором.
      if (review.revisedText?.trim()) {
        const guarded = rejectNonPostWriterOutput(review.revisedText.trim());
        if (!guarded) {
          const repairedRevised = repairPublishableDraft({
            draft: { ...draft, text: review.revisedText.trim() },
            isConversational,
            destinationUrl: publication.destinationUrl,
            platform,
            topic: publication.targetQuery ?? publication.title,
            finalRound: true,
            contract,
          });
          draft = repairedRevised.draft;
          repairs.push(...repairedRevised.repairs);
        }
      }

      if (approvedByScorecard(review, scoreKeys)) {
        approvedDraft = draft;
        break;
      }
      if (review.decision === "REJECT") break;
      // Круг засчитан: автор написал, редактор ответил. Счёт пожизненный —
      // он переживает возврат исчерпанного круга на склад, в отличие от `round`.
      lifetimeRounds += 1;
      previousDraft = draft;
      previousReview = review.decision === "APPROVE"
        ? {
          ...review,
          decision: "REVISE",
          issues: ["Взвешенная оценка ниже 35 или критический критерий ниже 4 — материал не может быть утверждён."],
          revisionBrief: ["Исправить критические параметры и вернуть полный материал."],
        }
        : review;
    }

    if (!approvedDraft || !lastWriter || !lastReviewer) {
      const lastReview = iterationHistory.at(-1)?.review;
      /**
       * B700 фаза 6 (страховка) — «поправимо» не значит «в брак».
       *
       * Замер прода 2026-08-10: 10 материалов ушли в архив, у ВСЕХ три `REVISE`
       * подряд и ни одного `REJECT`. Редактор трижды говорил «правки минимальны
       * и не затрагивают смысл» — после чего материал выбрасывался по
       * исчерпанию кругов. Замер 11.08 после правки сходимости показал, что
       * замечания теперь повторяются («Неустранённые дефекты из прошлого
       * раунда … Новых блокирующих замечаний нет»), то есть круги СХОДЯТСЯ, а
       * материал всё равно умирает: один из них — за девять лишних символов.
       *
       * Отсюда граница. `REJECT` — приговор редактора, и он исполняется сразу.
       * `REVISE` — это «доделать», и материал возвращается на склад ещё на один
       * круг, сохраняя историю замечаний. Круги считаются пожизненно
       * (`lifetimeRounds`), иначе возврат превратился бы в вечную доработку.
       *
       * Слот при этом ничего не ждёт: закрывшееся окно уводит материал в
       * перенос (B645), а исчерпанный бюджет обращений (B680) убивает его в
       * любом случае. Страховка добавляет кругов, а не бессмертие.
       */
      const revisable = lastReview?.decision === "REVISE"
        && lifetimeRounds < EDITORIAL_LIFETIME_ROUND_LIMIT
        && Boolean(previousDraft ?? approvedDraft);
      if (revisable) {
        await db.externalPublication.update({
          where: { id: publication.id },
          data: {
            attemptCount: { increment: 1 },
            agentWriterProvider: lastWriter?.provider,
            agentWriterModel: lastWriter?.model,
            lastError: `Круг правки исчерпан, но редактор просил доработку, а не брак `
              + `(${lifetimeRounds} из ${EDITORIAL_LIFETIME_ROUND_LIMIT} кругов за жизнь материала). `
              + `Материал остаётся в работе: ${lastReview?.summary ?? "замечания в истории раундов"}`,
            // Склад остаётся открытым и несёт замечания последнего раунда —
            // следующий проход продолжит правку, а не начнёт материал заново.
            agentWriterDraft: {
              round: 1,
              lifetimeRounds,
              research,
              iterationHistory,
              previousDraft: previousDraft ?? approvedDraft,
              previousReview: lastReview,
              pending: null,
            } as unknown as Prisma.InputJsonValue,
            agentWrittenAt: new Date(),
          },
        });
        return { status: "revising" as const };
      }

      /**
       * B713 §3 — ПОСЛЕДНИЙ КРУГ ВЫПУСКАЕТ ЛУЧШЕЕ, А НЕ ХОРОНИТ ВСЁ.
       *
       * Замер прода 03.08–17.08: 21 материал умер там, где редактор возражал по
       * ОДНОМУ пункту и сам признавал остальное годным — «превышение лимита на
       * 48 символов не устранено, остальные параметры соответствуют
       * требованиям». Материал при этом уже стоил кругов автора и редактора.
       *
       * Решение владельца 2026-08-17: выпускать лучший из написанных
       * черновиков, а в маркетинговый канал слать пометку, что материал вышел
       * без полного одобрения и с какими замечаниями.
       *
       * ⚠ ГРАНИЦА НЕ СДВИНУТА ТАМ, ГДЕ ОНА ПРО БЕЗОПАСНОСТЬ. `pickBestDraft`
       * не отдаёт кандидата с приговором `REJECT`, с флагом безопасности и с
       * пустым текстом: «доделать» и «негодно» — разные вердикты, и подменять
       * второй первым нельзя. Плюс на границе наружу стоит рубеж выпуска
       * (B713 §1), который не пропустит не-пост, чем бы его ни одобрили.
       */
      const fallback = pickBestDraft(iterationHistory.map((iteration) => ({
        round: iteration.round,
        text: iteration.candidate.text ?? "",
        scores: iteration.review?.scores,
        decision: iteration.review?.decision ?? "REVISE",
        safetyFlags: iteration.candidate.safetyFlags ?? [],
        issues: iteration.review?.issues ?? [],
      })));
      if (fallback) {
        const chosen = iterationHistory.find((iteration) => iteration.round === fallback.round);
        if (chosen) {
          approvedDraft = chosen.candidate;
          lastWriter = { provider: chosen.writer.provider, model: chosen.writer.model } as typeof lastWriter;
          lastReviewer = { provider: chosen.reviewer.provider, model: chosen.reviewer.model } as typeof lastReviewer;
          releasedWithoutApproval = {
            round: fallback.round,
            score: fallback.score,
            outstandingIssues: fallback.outstandingIssues,
          };
          log.warn("marketing.agent_released_without_approval", {
            publicationId: publication.id,
            round: fallback.round,
            score: fallback.score,
            issues: fallback.outstandingIssues.length,
          });
        }
      }
    }

    if (!approvedDraft || !lastWriter || !lastReviewer) {
      const lastReview = iterationHistory.at(-1)?.review;
      await db.externalPublication.update({
        where: { id: publication.id },
        data: {
          status: "FAILED",
          lastError: lastReview?.summary || "Independent reviewer did not approve the draft in three rounds",
          attemptCount: { increment: 1 },
          agentWriterProvider: lastWriter?.provider,
          agentWriterModel: lastWriter?.model,
          agentReviewerProvider: lastReviewer?.provider,
          agentReviewerModel: lastReviewer?.model,
          agentReview: { research, iterations: iterationHistory } as unknown as Prisma.InputJsonValue,
          agentReviewedAt: new Date(),
          // B700: исход терминальный — склад закрывается. Оставленная стадия
          // означала бы «этот текст ещё ждёт редактора», а его уже отклонили.
          agentWriterDraft: Prisma.DbNull,
          agentWrittenAt: null,
        },
      });
      return { status: "rejected" as const };
    }

    // B654: у площадки без автоматического выпуска утверждённый материал ждёт
    // человека, а не встаёт в очередь, которой для неё не существует.
    const nextStatus = isConversational
      ? "REVIEW"
      : approvedStatusForPlatform(platform);
    /**
     * B732 — платная обложка рисуется ОДИН раз, при утверждении материала.
     *
     * Здесь, а не в маршруте отдачи файла: за обложкой ходят Meta, Дзен и кто
     * угодно ещё, сколько угодно раз, и генерация «по обращению» превратила бы
     * одобренный владельцем $1,13/мес в счёт, зависящий от числа скачиваний.
     *
     * Только Дзен и Instagram (`isPaidCoverPlatform`). Отказ по любой причине —
     * потолок, нет учётки, отказ модели — возвращает `null`, и материал уходит
     * с 0-токенным шаблоном Satori; причина остаётся в логе.
     */
    const paidCover = !isConversational && isPaidCoverPlatform(platform)
      ? await generatePaidCover({
        key: publication.key,
        platform,
        title: approvedDraft.title?.trim() || publication.title,
        cluster: publication.cluster,
        mediaBrief: approvedDraft.mediaBrief,
      })
      : null;

    const updated = await db.externalPublication.update({
      where: { id: publication.id },
      data: {
        title: approvedDraft.title?.trim() || publication.title,
        body: approvedDraft.text.trim(),
        mediaUrl: isConversational || parsedNotes?.formatMedia === "none"
          // B733: формат вправе выйти ТЕКСТОМ. Владелец 2026-09-08: «посты в
          // Threads не обязательно вообще должны иметь скриншоты». Обложка,
          // прицепленная к однострочной шутке, выдаёт заготовку.
          ? null
          : (() => {
              const baseUrl = `https://eterapy.com/api/marketing/media/${encodeURIComponent(publication.key)}`;
              // Нарисованная модель лежит в базе под ключом материала — маршрут
              // отдаёт её байтами, ничего не пересчитывая.
              if (paidCover) return `${baseUrl}?layout=paid`;
              /**
               * B727 — раскладку выбирает общее правило по ТЕЛУ материала.
               * Прежняя проверка спрашивала заголовок и не сработала ни разу:
               * цитату собеседника персона Ани ставит в текст поста.
               */
              const { layout } = coverLayoutFor({
                title: approvedDraft.title?.trim() || publication.title,
                body: approvedDraft.text,
                cluster: publication.cluster,
              });
              return layout === "chat_mockup" ? `${baseUrl}?layout=chat_mockup` : baseUrl;
            })(),
        status: nextStatus,
        // Ручная площадка не «публикуется сама» ни при каком выключателе:
        // дороги наружу у неё нет, и признак должен говорить это прямо.
        autoPublish: !isConversational && nextStatus === "SCHEDULED",
        attemptCount: { increment: 1 },
        // B713 §3: материал, вышедший без полного одобрения, обязан нести это
        // на себе. Пустая `lastError` у такого материала означала бы, что круги
        // сошлись, — а они не сошлись, просто кончились.
        lastError: releasedWithoutApproval
          ? `Выпущен без полного одобрения редактора (лучший круг ${releasedWithoutApproval.round}, `
            + `сумма оценок ${releasedWithoutApproval.score}). Осталось неустранённым: `
            + `${releasedWithoutApproval.outstandingIssues.join("; ") || "замечания в истории раундов"}`
          : null,
        agentWriterProvider: lastWriter.provider,
        agentWriterModel: lastWriter.model,
        agentReviewerProvider: lastReviewer.provider,
        agentReviewerModel: lastReviewer.model,
        agentReview: { research, iterations: iterationHistory } as unknown as Prisma.InputJsonValue,
        agentReviewedAt: new Date(),
        // B700: материал прошёл обе операции — незавершённого производства на
        // строке не остаётся.
        agentWriterDraft: Prisma.DbNull,
        agentWrittenAt: null,
      },
    });
    if (isConversational) await requestMarketingModeration(updated.id);
    await resolveMarketingSignal(`agent-draft:${publication.id}`).catch(() => undefined);
    // Прошла хоть одна генерация — ёмкость вернулась. B695: вместе с ней
    // закрываются и соседние причины простоя, иначе кокпит покажет открытым
    // то, что уже прошло.
    for (const key of ["agent:capacity", "agent:output-ceiling", "agent:route-failure"]) {
      await resolveMarketingSignal(key).catch(() => undefined);
    }
    return { status: nextStatus.toLowerCase() as "review" | "scheduled" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Ёмкость и сузившийся пул моделей вернутся сами: строка остаётся
    // черновиком и попадёт в следующий проход. FAILED здесь означал бы
    // «материал негоден», а он не при чём.
    const deferrable = isDeferrableError(error);
    await db.externalPublication.update({
      where: { id: publication.id },
      data: deferrable
        // B700: отложенный отказ склад НЕ трогает — в нём лежит написанное, ради
        // сохранности которого склад и заведён. Признанный брак материала склад
        // закрывает: иначе возврат из `FAILED` (registry-recovery) поднял бы к
        // редактору ровно тот текст, который только что забраковали.
        ? { lastError: message }
        : {
          status: "FAILED",
          lastError: message,
          attemptCount: { increment: 1 },
          agentWriterDraft: Prisma.DbNull,
          agentWrittenAt: null,
        },
    }).catch(() => undefined);
    await recordSignal(deferrable
      ? {
        // Один сигнал на исчерпание, а не инцидент на каждый пост: иначе
        // кокпит владельца заливает сотней одинаковых строк.
        // B680: расход одного материала — отдельная причина с отдельным
        // именем. В `agent:capacity` она читалась бы как «провайдеры отказали»,
        // и владелец опять пошёл бы проверять ключи.
        // B695: обрыв по нашему потолку и отказ дороги — тоже отдельные
        // причины. Под именем `agent:capacity` владелец пошёл бы проверять
        // квоты там, где чинить нужно потолок вывода или маршрут.
        key: error instanceof MarketingAttemptBudgetError
          ? "agent:attempt-budget"
          : error instanceof MarketingTruncatedOutputError
          ? "agent:output-ceiling"
          : error instanceof MarketingInfrastructureError
          ? "agent:route-failure"
          : "agent:capacity",
        kind: "AGENT_RUN",
        severity: "WARNING",
        // B638: заголовок называет ПРИЧИНУ, а не первое подвернувшееся слово.
        // «Кончилась ёмкость провайдеров» стояло и тогда, когда провайдеры были
        // здоровы, а упёрлись мы в собственный суточный потолок — владелец шёл
        // проверять ключи вместо того, чтобы поднять число у себя. Тот же класс
        // ошибки, что стухшая отметка в панели провайдеров: панель называла не
        // ту причину.
        title: error instanceof MarketingAttemptBudgetError
          ? "Материал израсходовал лимит попыток и ждёт следующего прохода"
          : error instanceof MarketingModelSeparationError
          ? "SMM-агент ждёт вторую независимую модель"
          : error instanceof MarketingTruncatedOutputError
          ? "Ответ модели обрезан НАШИМ потолком вывода — материал ждёт другую модель"
          : error instanceof MarketingInfrastructureError
          ? "Маршруты отвечали отказом дороги — материал ждёт следующего прохода"
          : isOwnBudgetCeiling(message)
            ? "SMM-агент остановлен: упёрся в наш суточный потолок токенов"
            : "SMM-агент остановлен: провайдеры отказали в ёмкости",
        summary: isOwnBudgetCeiling(message)
          ? `${message} — это НАШ потолок (\`dailyTokenBudget\` в task-policy), а не квота провайдера. `
            + "Ключи и аккаунты проверять не нужно."
          : error instanceof MarketingTruncatedOutputError
          ? `${message} — чинится потолком \`MARKETING_MAX_STRUCTURED_OUTPUT_TOKENS\` `
            + "или заменой думающей модели роли, а не ключами."
          : message,
        evidence: { platform },
      }
      : {
        key: `agent-draft:${publication.id}`,
        kind: "AGENT_RUN",
        severity: "INCIDENT",
        title: `SMM-агент не обработал «${publication.title}»`,
        summary: message,
        evidence: { publicationId: publication.id, platform },
      }).catch(() => undefined);
    log.error("marketing-agent.draft_failed", {
      publicationId: publication.id,
      error: serializeError(error),
    });
    // B658: причина нужна вызывающему циклу — на нехватке ёмкости проход
    // останавливается, а не идёт за следующим материалом с тем же исходом.
    return { status: "failed" as const, error: message, capacity: isCapacityError(error) };
  }
}

/**
 * B625 — генерация привязана к слоту, а не к длине очереди.
 *
 * Замер прода 2026-07-30: цикл брал по три черновика КАЖДУЮ минуту по всей
 * очереди, отсортированной по плановой дате. План двухнедельный, поэтому за
 * 00:01–02:27 writer израсходовал 603 001 токен (78 запросов) на материалы
 * вплоть до 7 августа — и следующие девять часов каждый проход отвечал «нет
 * ёмкости». Публикации сегодняшнего дня при этом ждали полуночи: данные не
 * терялись (строка остаётся черновиком), простаивала очередь.
 *
 * Потолок токенов тут ни при чём — его уже поднимали в B622 с 80k до 600k.
 * Причина в том, что суточная ёмкость тратилась на две недели вперёд. Окно
 * опережения возвращает суточному потолку смысл суточной нормы: в работу
 * попадает то, что выходит сегодня и завтра.
 */
export const MARKETING_GENERATION_LEAD_MS = 30 * 60 * 60_000;

export function marketingGenerationHorizon(now: Date) {
  return new Date(now.getTime() + MARKETING_GENERATION_LEAD_MS);
}

/**
 * B629 → B700 фаза 2: константы «плановых материалов в час» БОЛЬШЕ НЕТ.
 *
 * Она решала настоящую задачу — окно опережения B625 ограничило, ЧТО берётся в
 * работу, но не ограничило, как быстро, и замер прода 2026-07-30 показал 78
 * генераций подряд за 2,5 часа. Ошибка была не в существовании шага, а в том,
 * что «два в час» не выведено ни из плана (6–7 материалов в сутки против 48 при
 * такой норме), ни из остатка квот.
 *
 * Теперь норму часа считает `conveyorTact` из спроса, запаса и ёмкости, а
 * переменная окружения `MARKETING_PLANNED_DRAFTS_PER_HOUR` ни на что не влияет
 * и в выкатке не задана. Потолок прохода остаётся `LOOP_LIMIT`.
 */

/**
 * B658 — сколько агент не трогает плановую генерацию после отказа по ёмкости.
 *
 * Тридцать минут выбраны не наугад: при норме в два материала в час это ровно
 * один пропущенный слот нормы. Когда ёмкость в порядке, сигнала нет и остывание
 * не стоит ничего; когда она кончилась, оно превращает полсотни бесполезных
 * вызовов writer'а в один.
 */
export const MARKETING_CAPACITY_COOLDOWN_MS = Number(
  process.env.MARKETING_CAPACITY_COOLDOWN_MS || 30 * 60_000,
);

/**
 * B658 — стоит ли остывание прямо сейчас.
 *
 * Читать сигнал — вспомогательное действие: если оно почему-то не удалось,
 * генерацию это блокировать не должно. Молчаливое «нет» здесь безопаснее
 * молчаливого «да»: в худшем случае вернётся прежнее поведение, а не встанет
 * весь контур.
 */
export async function marketingCapacityCooldownActive(now: Date): Promise<boolean> {
  return Boolean(await marketingCapacityPausedUntil(now));
}

/**
 * B700 фаза 3 — до какого момента линия не запускает плановую генерацию.
 *
 * Отличие от прежнего плоского срока в том, ЧЬЁ это решение. Раньше линия
 * ждала свои 30 минут независимо от причины; теперь срок называет тот, кто
 * отказал: `cooldownUntil` ключа собран из тела ответа провайдера (B699).
 * Groq на исчерпанном суточном потолке говорит «через 59 минут» — возвращаться
 * через полчаса значит потратить проход впустую и снова записать отказ.
 *
 * Сигнал больше не фильтруется по свежести: срок ожидания теперь может быть
 * длиннее плоских 30 минут, и отсечка по `lastSeenAt` обнуляла бы паузу раньше
 * её собственного конца. От вечного сна защищают две вещи: суточный потолок
 * внутри `marketingLinePauseUntil` и `sweepStaleMarketingSignals`, который
 * закрывает сигнал, переставший повторяться.
 *
 * Чтение остаётся вспомогательным: сбой запроса не блокирует генерацию.
 */
export async function marketingCapacityPausedUntil(now: Date): Promise<Date | null> {
  try {
    const signal = await db.marketingAutomationSignal.findFirst({
      where: { key: "agent:capacity", status: "OPEN" },
      orderBy: { lastSeenAt: "desc" },
      select: { lastSeenAt: true },
    });
    if (!signal) return null;

    const poolResumeAt = await marketingPoolResumeAt(now).catch(() => null);
    return marketingLinePauseUntil({
      now,
      signalLastSeenAt: signal.lastSeenAt,
      poolResumeAt,
      flatCooldownMs: MARKETING_CAPACITY_COOLDOWN_MS,
    });
  } catch {
    return null;
  }
}

/** Разговорные материалы идут вне часового шага: ответ нельзя отложить. */
const CONVERSATIONAL_LOOP_LIMIT = 3;

/** Состояния, в которых материал считается готовым к выпуску. */
const MARKETING_APPROVED_STATUSES = ["SCHEDULED", MARKETING_MANUAL_STATUS] as const;

/**
 * B700 фаза 2 — целевой запас утверждённого впереди, в материалах.
 *
 * Двое суток выпуска, и не круглым числом, а по самому плану: сколько слотов
 * контент-план ставит на ближайшие двое суток, столько и держим готовыми.
 * Почему именно двое — это окно, за которое линия успевает восстановиться после
 * суточного выгорания квот: бесплатные потолки провайдеров суточные, и запас
 * меньше суток означает пропущенные окна на следующий же день после отказа.
 *
 * Запас БОЛЬШЕ двух суток — сожжённая квота: материал успеет устареть, а тема
 * потерять актуальность раньше, чем дойдёт до своего окна.
 */
export function marketingBufferTarget(now: Date): number {
  const until = new Date(now.getTime() + 2 * 24 * 3_600_000);
  try {
    return contentPlanFor(now).filter((slot) => {
      const at = new Date(slot.scheduledAt).getTime();
      return at >= now.getTime() && at <= until.getTime();
    }).length;
  } catch {
    return 6;
  }
}

/**
 * Итог прохода линии.
 *
 * Форма ОДНА на все ветки, включая выключенный контур. Разные формы у ветвей
 * означали бы, что сводка и журнал вынуждены каждый раз проверять, какое поле
 * сегодня существует, — а `bottleneck` и `tact` нужны именно тогда, когда
 * что-то пошло не так.
 */
export interface MarketingAgentCycleResult {
  enabled: boolean;
  processed: number;
  conversational: number;
  planned: number;
  reviewQueue: number;
  deferred: number;
  paced: number;
  capacityStop: boolean;
  capacityCooldown: boolean;
  bottleneck: ConveyorBottleneck;
  tact: {
    demand: number;
    ready: number;
    awaitingReview: number;
    writtenThisHour: number;
    perHour: number;
    writerBudget: number;
    capacityPerHour: number;
  };
  pausedUntil?: string;
}

const IDLE_TACT = {
  demand: 0,
  ready: 0,
  awaitingReview: 0,
  writtenThisHour: 0,
  perHour: 0,
  writerBudget: 0,
  capacityPerHour: 0,
} as const;

export async function runMarketingAgentCycle(
  input: { now?: Date } = {},
): Promise<MarketingAgentCycleResult> {
  if (!await marketingAgentEnabled()) {
    return {
      enabled: false,
      processed: 0,
      deferred: 0,
      conversational: 0,
      planned: 0,
      reviewQueue: 0,
      paced: 0,
      capacityStop: false,
      capacityCooldown: false,
      bottleneck: "buffer",
      tact: { ...IDLE_TACT },
    };
  }
  const now = input.now ?? new Date();
  // B677: снимаем с доски то, чего больше не происходит. Первым действием
  // прохода, а не последним: если ниже что-то упадёт, доска всё равно окажется
  // честной, и владелец увидит сегодняшнюю причину, а не позавчерашнюю.
  await sweepStaleMarketingSignals(now).catch(() => undefined);
  const horizon = marketingGenerationHorizon(now);
  // B700 фаза 5: условия очередей — общие с панелью сводки. Второе определение
  // тех же выборок означало бы, что панель рано или поздно покажет не то узкое
  // место, которое на самом деле связывает линию.
  const dueNow = dueNowFilter(horizon);
  const readyForWork = readyForWorkFilter;

  // Разговорное — первым и всегда: у него отдельная ёмкость и отдельный смысл
  // срочности. Плановое берётся тем, что осталось от часового шага.
  const conversational = await db.externalPublication.findMany({
    where: { AND: [readyForWork, dueNow, conversationalFilter] },
    orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }],
    take: CONVERSATIONAL_LOOP_LIMIT,
    select: { id: true },
  });

  /** Спрос окна: плановое, ещё не доведённое до утверждения. */
  const demandFilter = { AND: [readyForWork, dueNow, plannedFilter] };

  const hourAgo = new Date(now.getTime() - 60 * 60_000);
  // B740 — потолок очереди редактора спрашивается у настроек, а не берётся из
  // окружения, прочитанного на старте процесса: правка оркестратора обязана
  // менять поведение, а не только строку в таблице.
  const maxAwaitingReview = await marketingMaxAwaitingReview();
  const [writtenThisHour, deferred, awaitingReview, demand, ready] = await Promise.all([
    /**
     * B700 фаза 2 — норма часа считается по СДЕЛАННОМУ, а не по дошедшему до конца.
     *
     * Раньше здесь стоял только `agentReviewedAt`, а эта отметка появляется
     * лишь на материале, дошедшем до терминального исхода. Когда редактор падал
     * на исчерпанном потолке, отметки не было — норма часа выглядела нетронутой,
     * и следующий тик воркера брал ту же строку заново (B658, замер прода
     * 2026-08-04).
     *
     * Одного `agentWrittenAt` тоже мало: терминальный исход его обнуляет, и
     * материал, успевший пройти обе операции внутри часа, из счётчика исчезал.
     * Норма протекала ровно в хорошем случае — чем быстрее линия доводит
     * материал, тем больше сверх нормы она вправе начать.
     *
     * Поэтому «или» из двух непересекающихся множеств: незавершённое (склад ещё
     * открыт) и завершённое за этот час. Пересечься они не могут по построению.
     * Завершённое захватит и материалы, чей автор отработал в прошлом часу, —
     * это ошибка в консервативную сторону, и она безопаснее протечки.
     */
    db.externalPublication.count({
      where: {
        AND: [plannedFilter, {
          OR: [
            { agentWrittenAt: { gte: hourAgo }, agentReviewedAt: null },
            { agentReviewedAt: { gte: hourAgo } },
          ],
        }],
      },
    }),
    db.externalPublication.count({
      where: { AND: [readyForWork, { scheduledFor: { gt: horizon } }] },
    }),
    db.externalPublication.count({
      where: { AND: [readyForWork, plannedFilter, awaitingReviewFilter] },
    }),
    db.externalPublication.count({ where: demandFilter }),
    db.externalPublication.count({
      where: {
        AND: [
          plannedFilter,
          { status: { in: [...MARKETING_APPROVED_STATUSES] } },
          { scheduledFor: { gte: now, lte: horizon } },
        ],
      },
    }),
  ]);

  /**
   * B700 фаза 3 — линия ждёт срок, названный провайдером, а не свои 30 минут.
   *
   * Разговорные материалы паузы не знают: ответ человеку откладывать нельзя, а
   * ёмкость у него отдельная (`marketing-reply-*`).
   */
  const pausedUntil = await marketingCapacityPausedUntil(now);
  const capacityCooldown = Boolean(pausedUntil);

  /**
   * B700 фаза 2 — такт вместо константы «2 в час».
   *
   * Спрос, запас и ёмкость собраны выше живыми числами; арифметика и барабан
   * живут в `conveyor-tact.ts`, где их держит прогон, а не живая база.
   */
  const capacity = capacityCooldown
    ? { perHour: 0, materialsLeftToday: 0 }
    : await marketingHourlyCapacity(now).catch(() => ({ perHour: 2, materialsLeftToday: 2 }));
  const tact = conveyorTact({
    demand,
    buffer: marketingBufferTarget(now),
    ready,
    /**
     * Знаменатель такта — само окно опережения, а не срок ближайшего слота.
     *
     * Такт отвечает на вопрос «с какой скоростью производить», а не «что взять
     * первым». Срочность — это ПОРЯДОК очереди, и ей место в отдельной правке
     * (фаза 8, «срочное вперёд»): если считать темп от ближайшего слота, один
     * горящий материал разгонял бы всю линию и выжигал квоту на остальных.
     */
    hoursToHorizon: Math.ceil(MARKETING_GENERATION_LEAD_MS / 3_600_000),
    capacityPerHour: capacity.perHour,
    awaitingReview,
    maxAwaitingReview,
    writtenThisHour,
  });

  const plannedBudget = capacityCooldown ? 0 : Math.min(LOOP_LIMIT, tact.writerBudget);
  /**
   * B632 — исключение с условием окончания.
   *
   * Окно опережения в 30 часов даёт примерно по одному материалу Дзена в сутки,
   * и лента набиралась бы до нашей планки полторы недели. Пока лента недобрана,
   * черновики Дзена берутся вне окна — но внутри того же часового шага, поэтому
   * это не возврат к пачке.
   *
   * ⚠ B698 — ПОЧЕМУ ДОБАВИЛОСЬ ВТОРОЕ УСЛОВИЕ. Исключение обещало сняться «само
   * на десятом материале». Обещание держалось на том, что лента растёт. Выпуск
   * переведён на браузерную сессию, и лента не растёт вовсе: исключение стало
   * бессрочным, а черновики Дзена — вечно досрочными, то есть их расписание
   * перестало что-либо значить. Ускорение имеет смысл ровно тогда, когда
   * работает то, что оно ускоряет.
   *
   * Проверка делается только тогда, когда норма часа не исчерпана: иначе это
   * лишний запрос в базу на каждом тике воркера.
   */
  /**
   * B700 фаза 2 — БАРАБАН разбирается первым и своим бюджетом.
   *
   * Фаза 1 ставила написанное впереди ненаписанного внутри одного общего
   * бюджета. Этого мало: когда такт даёт ноль (буфер полон, ёмкость выжжена,
   * очередь редактора переполнена), обнулялась и очередь редактора — то есть
   * линия переставала ДОДЕЛЫВАТЬ уже оплаченное. Незавершённое производство
   * копилось ровно там, где его меньше всего можно себе позволить.
   *
   * Теперь это две разные операции с разной экономикой. Материал со склада стоит
   * один вызов редактора и сразу превращается в готовое — его разбор ограничен
   * только паузой линии. Свежий черновик стоит два вызова и увеличивает склад —
   * его разрешает такт.
   */
  const reviewQueue = capacityCooldown
    ? []
    : await db.externalPublication.findMany({
      where: { AND: [readyForWork, plannedFilter, awaitingReviewFilter] },
      orderBy: [{ scheduledFor: "asc" }, { agentWrittenAt: "asc" }],
      take: LOOP_LIMIT,
      select: { id: true, scheduledFor: true },
    });

  /**
   * B700 фаза 8 — место в проходе автору больше не выдаётся «по остатку».
   *
   * Было `LOOP_LIMIT - reviewQueue.length`: три несрочных написанных материала
   * занимали проход целиком, и материал с сегодняшним окном не начинали вовсе.
   * Теперь оба множества сливаются в одну очередь по сроку выпуска
   * (`orderByUrgency`) и обрезаются по `LOOP_LIMIT` уже ПОСЛЕ слияния —
   * поэтому автору достаётся столько, сколько разрешил такт, а кто именно
   * попадёт в проход, решает срок, а не факт написания.
   */
  const writerRoom = Math.max(0, Math.min(plannedBudget, LOOP_LIMIT));
  /**
   * B632 — исключение с условием окончания.
   *
   * Окно опережения в 30 часов даёт примерно по одному материалу Дзена в сутки,
   * и лента набиралась бы до нашей планки полторы недели. Пока лента недобрана,
   * черновики Дзена берутся вне окна — но внутри того же такта, поэтому это не
   * возврат к пачке.
   *
   * ⚠ B698 — ПОЧЕМУ ДОБАВИЛОСЬ ВТОРОЕ УСЛОВИЕ. Исключение обещало сняться «само
   * на десятом материале». Обещание держалось на том, что лента растёт. Выпуск
   * переведён на браузерную сессию, и лента не растёт вовсе: исключение стало
   * бессрочным, а черновики Дзена — вечно досрочными, то есть их расписание
   * перестало что-либо значить. Ускорение имеет смысл ровно тогда, когда
   * работает то, что оно ускоряет.
   *
   * Проверка делается только тогда, когда такт разрешил автору писать: иначе
   * это лишний запрос в базу на каждом тике воркера.
   */
  const plannedDue = writerRoom > 0 && await dzenFeedNeedsTopUp()
    ? { OR: [dueNow, { platform: "dzen" }] }
    : dueNow;
  // Автор берёт то, у чего склад ПУСТ. Симметрично очереди редактора: границу
  // между операциями проводит склад, а не отметка времени.
  const freshFilter = {
    AND: [readyForWork, plannedDue, plannedFilter, { agentWriterDraft: { equals: Prisma.DbNull } }],
  };
  const fresh = writerRoom > 0
    ? await db.externalPublication.findMany({
      where: freshFilter,
      orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }],
      take: writerRoom,
      select: { id: true, scheduledFor: true },
    })
    : [];
  /**
   * B700 фаза 8 — одна очередь по сроку вместо двух по дешевизне.
   *
   * Слияние, а не склейка: при равном сроке вперёд идёт написанное (его
   * остаток стоит одного вызова редактора против двух вызовов полного цикла),
   * но горящее окно обгоняет склад. Правило живёт в `conveyor-tact.ts`, где его
   * держит прогон, а не живая база.
   */
  const planned = orderByUrgency([
    ...reviewQueue.map((row) => ({ ...row, written: true })),
    ...fresh.map((row) => ({ ...row, written: false })),
  ]).slice(0, LOOP_LIMIT);
  // «Отложено тактом» — отдельное число: иначе пустая очередь и сработавший
  // пейсинг снаружи выглядят одинаково.
  const paced = writerRoom > 0
    ? 0
    : await db.externalPublication.count({ where: freshFilter });

  // B658: проход останавливается на первой же нехватке ёмкости. Раньше он
  // честно дорабатывал список — и каждый следующий материал повторял ровно тот
  // же путь: writer отрабатывал успешно и списывал токены, reviewer падал на
  // исчерпанном потолке, материал оставался черновиком.
  let processed = 0;
  let capacityStop = false;
  for (const draft of [...conversational, ...planned]) {
    const outcome = await processMarketingDraft(draft.id);
    processed += 1;
    if (outcome.status === "failed" && outcome.capacity) {
      capacityStop = true;
      break;
    }
  }
  return {
    enabled: true,
    processed,
    conversational: conversational.length,
    planned: planned.length,
    deferred,
    paced,
    capacityStop,
    capacityCooldown,
    /**
     * B700 фаза 2/3 — такт в журнале.
     *
     * Одна строка прохода должна отвечать на вопрос «почему линия молчит», не
     * заставляя лезть в базу. Без этих чисел «processed: 0» одинаково выглядит
     * и при полном буфере, и при выжженных квотах, и при переполненном складе, —
     * а меры это требует совершенно разные.
     */
    // B700 фаза 8: сколько мест прохода досталось складу ПОСЛЕ слияния по
    // сроку, а не сколько склад предъявил. Иначе журнал обещал бы разбор
    // написанного, которое горящее окно вытеснило из этого прохода.
    reviewQueue: planned.filter((row) => row.written).length,
    bottleneck: tact.bottleneck,
    tact: {
      demand,
      ready,
      awaitingReview,
      writtenThisHour,
      perHour: tact.perHour,
      writerBudget: tact.writerBudget,
      capacityPerHour: capacity.perHour,
    },
    ...(pausedUntil ? { pausedUntil: pausedUntil.toISOString() } : {}),
  };
}

export async function upsertMarketingSignal(input: Parameters<typeof recordSignal>[0]) {
  return recordSignal(input);
}

export async function resolveMarketingSignal(key: string) {
  const now = new Date();
  return db.marketingAutomationSignal.updateMany({
    where: { key, status: "OPEN" },
    data: { status: "RESOLVED", resolvedAt: now, lastSeenAt: now },
  });
}

/** Сколько молчания достаточно, чтобы считать сигнал прекратившимся. */
export const MARKETING_SIGNAL_STALE_MS = 24 * 60 * 60_000;

/**
 * B677 · Сигнал закрывается сам, когда перестал повторяться.
 *
 * Владелец 2026-08-05: «в блоке накопились проблемы». Накопились они не потому,
 * что их не чинили, а потому, что закрыть сигнал МОГ ТОЛЬКО тот код, который его
 * поднял, — и только если снова дошёл до того же места. Разовые сигналы такой
 * возможности не имеют вовсе:
 *
 *  • `agent-draft:<id>` поднимается на конкретный материал. Материал потом
 *    выходит, переносится или архивируется — второго прохода по нему не будет
 *    никогда, и строка висит вечно. Здесь она закрывается по СОСТОЯНИЮ
 *    материала, а не по таймеру: вышел или заархивирован — вопрос закрыт.
 *  • Повторяющиеся сигналы (провайдер, обход, метрики) закрываются молчанием:
 *    если причина ещё жива, ближайший проход поднимет строку заново тем же
 *    ключом, и она вернётся с честным свежим `lastSeenAt`.
 *
 * Функция ничего не «чинит» — она снимает с доски то, чего уже не происходит.
 */
export async function sweepStaleMarketingSignals(now = new Date()) {
  const staleBefore = new Date(now.getTime() - MARKETING_SIGNAL_STALE_MS);

  const open = await db.marketingAutomationSignal.findMany({
    where: { status: "OPEN" },
    select: { id: true, key: true, lastSeenAt: true },
  }).catch(() => []);
  if (open.length === 0) return { closedStale: 0, closedDraft: 0 };

  // Разовые сигналы про конкретный материал: смотрим на сам материал.
  const draftIds = open
    .filter((row) => row.key.startsWith("agent-draft:"))
    .map((row) => row.key.slice("agent-draft:".length));
  const settled = draftIds.length
    ? await db.externalPublication.findMany({
      where: { id: { in: draftIds }, status: { notIn: ["DRAFT", "REVIEW"] } },
      select: { id: true },
    }).catch(() => [])
    : [];
  const settledKeys = settled.map((row) => `agent-draft:${row.id}`);

  // Материал, который удалили целиком, тоже не должен держать строку.
  const knownDraftIds = draftIds.length
    ? new Set((await db.externalPublication.findMany({
      where: { id: { in: draftIds } },
      select: { id: true },
    }).catch(() => [])).map((row) => row.id))
    : new Set<string>();
  const vanishedKeys = draftIds
    .filter((id) => !knownDraftIds.has(id))
    .map((id) => `agent-draft:${id}`);

  const draftKeys = [...new Set([...settledKeys, ...vanishedKeys])];
  const staleKeys = open
    .filter((row) => !row.key.startsWith("agent-draft:") && row.lastSeenAt < staleBefore)
    .map((row) => row.key);

  const closedDraft = draftKeys.length
    ? (await db.marketingAutomationSignal.updateMany({
      where: { key: { in: draftKeys }, status: "OPEN" },
      data: { status: "RESOLVED", resolvedAt: now },
    }).catch(() => ({ count: 0 }))).count
    : 0;
  const closedStale = staleKeys.length
    ? (await db.marketingAutomationSignal.updateMany({
      where: { key: { in: staleKeys }, status: "OPEN" },
      data: { status: "RESOLVED", resolvedAt: now },
    }).catch(() => ({ count: 0 }))).count
    : 0;

  if (closedDraft || closedStale) {
    log.info("marketing.signals_swept", { closedDraft, closedStale });
  }
  return { closedStale, closedDraft };
}
