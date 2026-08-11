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
  MARKETING_AGENT_SYSTEM_PROMPT,
  MARKETING_REVIEWER_SYSTEM_PROMPT,
  marketingReviewerPrompt,
  marketingWriterPrompt,
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
  MARKETING_REPLY_REVIEWER_FEATURE,
  MARKETING_REPLY_WRITER_FEATURE,
  marketingModelFreshness,
  marketingProviderFromLabel,
  marketingProviderOrder,
} from "@/lib/marketing/model-pool";
import {
  marketingHourlyCapacity,
  marketingPoolAvailability,
  marketingPoolResumeAt,
} from "@/lib/marketing/pool-capacity";
import {
  conveyorTact,
  marketingLinePauseUntil,
  orderByUrgency,
  MARKETING_MAX_AWAITING_REVIEW,
  type ConveyorBottleneck,
} from "@/lib/marketing/conveyor-tact";
import {
  awaitingReviewFilter,
  conversationalFilter,
  dueNowFilter,
  plannedFilter,
  readyForWorkFilter,
} from "@/lib/marketing/conveyor-queues";
import { contentPlanFor } from "@/lib/marketing/content-plan";
import { dzenFeedNeedsTopUp } from "@/lib/marketing/dzen-feed";
import {
  draftLimitViolations,
  fallbackMediaBrief,
  platformLimitsForPrompt,
  platformPublishLimits,
  trimToLimit,
  type LimitViolation,
} from "@/lib/marketing/platform-limits";
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
 * Сколько обращений к моделям тратится на ОДИН материал за проход — обе роли,
 * все раунды правки, все ступени бюджета вывода вместе.
 *
 * 12 — это три полных раунда «автор + редактор» плюс двойной запас на перебор
 * провайдера. Больше уже не даёт материала: в замере прода материалы с сотней
 * попыток не выходили ни разу.
 */
export const MAX_STRUCTURED_ATTEMPTS_PER_MATERIAL = 12;

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
 */
export const MARKETING_WRITER_MAX_TOKENS = 4_000;
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
 */
export const MARKETING_REVIEWER_MAX_TOKENS = 8_000;

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
  revisedText: string;
  summary: string;
};

type AICompletion = Awaited<ReturnType<typeof aiComplete>>;
type StructuredCompletion<T> = { response: AICompletion; value: T };

const LOOP_LIMIT = 3;
const EDITORIAL_ROUND_LIMIT = 3;
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

function writerObject(raw: string, fallbackTitle: string): WriterOutput {
  try {
    return jsonObject<WriterOutput>(raw);
  } catch {
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
    return {
      title: jsonStringField(raw, "title") || fallbackTitle,
      text,
      audienceNeed: jsonStringField(raw, "audienceNeed") || "саморефлексия",
      goal: jsonStringField(raw, "goal") || "полезный отклик аудитории",
      disclosure: jsonStringField(raw, "disclosure") || "",
      cta: jsonStringField(raw, "cta") || "",
      mediaBrief: jsonStringField(raw, "mediaBrief") || "",
      researchUsed: [],
      safetyFlags: [],
    };
  }
}

function reviewerObject(raw: string, scoreKeys: readonly string[] = REVIEW_SCORE_KEYS): ReviewerOutput {
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
  if (value.revisedText?.trim()) {
    throw new Error("reviewer must not rewrite the writer's text");
  }
  return {
    ...value,
    issues: value.issues.map(String).filter(Boolean),
    revisionBrief: value.revisionBrief.map(String).filter(Boolean),
    revisedText: "",
    summary: String(value.summary ?? ""),
  };
}

function assertFreshMarketingModel(model: string) {
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
  field: "destinationUrl" | "cta" | "length" | "mediaBrief";
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
}): { draft: WriterOutput; repairs: DraftRepair[]; violations: LimitViolation[] } {
  const text = input.draft.text?.trim() ?? "";
  if (!text || (input.draft.safetyFlags?.length ?? 0) > 0) {
    throw new Error(`writer safety block: ${(input.draft.safetyFlags ?? []).join(", ") || "empty text"}`);
  }
  if (input.isConversational) {
    return { draft: { ...input.draft, text }, repairs: [], violations: [] };
  }
  if (!input.destinationUrl) {
    throw new Error("owned publication has no destination URL in the plan");
  }

  const repairs: DraftRepair[] = [];
  let repairedText = text;
  if (!repairedText.includes(input.destinationUrl)) {
    repairedText = `${repairedText}\n\n${input.destinationUrl}`;
    repairs.push({
      field: "destinationUrl",
      note: `Ссылку из плана дописала система: ${input.destinationUrl}`,
    });
  }
  let cta = input.draft.cta?.trim() ?? "";
  if (!cta) {
    cta = `Открыть по ссылке в тексте: ${input.destinationUrl}`;
    repairs.push({ field: "cta", note: "CTA заполнила система по целевой ссылке плана" });
  }

  let mediaBrief = input.draft.mediaBrief?.trim() ?? "";
  const violations = draftLimitViolations({
    platform: input.platform,
    text: repairedText,
    mediaBrief,
  });

  if (violations.length === 0 || !input.finalRound) {
    return {
      draft: { ...input.draft, text: repairedText, cta, mediaBrief },
      repairs,
      violations,
    };
  }

  const limits = platformPublishLimits(input.platform);
  for (const violation of violations) {
    if (violation.kind === "length" && limits.textLimit !== null) {
      const before = repairedText.length;
      repairedText = trimToLimit({
        text: repairedText,
        limit: limits.textLimit,
        mustKeep: input.destinationUrl,
      });
      repairs.push({
        field: "length",
        note: `Автор не уложился в ${limits.textLimit} символов за все раунды (${before}) — текст усекла система по границе предложения, ссылка сохранена.`,
      });
    }
    if (violation.kind === "media-brief") {
      mediaBrief = fallbackMediaBrief({ title: input.draft.title ?? "", topic: input.topic });
      repairs.push({
        field: "mediaBrief",
        note: "Визуальную идею подставила система: автор оставил поле пустым и после доработок.",
      });
    }
  }

  return { draft: { ...input.draft, text: repairedText, cta, mediaBrief }, repairs, violations: [] };
}

function approvedByScorecard(
  review: ReviewerOutput,
  scoreKeys: readonly string[] = REVIEW_SCORE_KEYS,
) {
  return review.decision === "APPROVE"
    && review.issues.length === 0
    && scoreKeys.every((key) => Number(review.scores[key]) >= 4);
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
}) {
  const failures: string[] = [];
  let capacityFailures = 0;
  let separationFailures = 0;
  // B695: сколько маршрутов упёрлось в НАШ потолок вывода и сколько отвалилось
  // по состоянию дороги. Оба счёта нужны в конце: если весь перебор состоял из
  // них, материал ждёт следующего прохода, а не бракуется.
  let truncationFailures = 0;
  let infrastructureFailures = 0;
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
      if (input.attempts.used >= MAX_STRUCTURED_ATTEMPTS_PER_MATERIAL) {
        throw new MarketingAttemptBudgetError(
          `Материал израсходовал ${input.attempts.used} обращений к моделям за проход `
          + `(предел ${MAX_STRUCTURED_ATTEMPTS_PER_MATERIAL}) и остаётся черновиком. `
          + `Последние отказы: ${failures.slice(-3).join("; ") || "нет"}`,
        );
      }
      input.attempts.used += 1;
    }
    try {
      const response = await aiComplete({
        feature: input.feature,
        dataClass: "PUBLIC_MARKETING",
        providerOrder: [provider],
        maxTokens: budget,
        temperature: input.temperature,
        requestId: `${input.requestId}:${provider.toLowerCase()}`
          + (truncationRetries > 0 ? `:b${truncationRetries}` : ""),
        messages: input.messages,
      });
      assertFreshMarketingModel(response.model);
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
          failures.push(`${provider}: ${error instanceof Error ? error.message : String(error)}`);
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
      if (isCapacityError(error)) capacityFailures += 1;
      else if (isInfrastructureRoutingError(error)) infrastructureFailures += 1;
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
  const tone = isConversational ? engagementToneById(publication.engagementTone) : null;
  const scoreKeys = isConversational
    ? [...REVIEW_SCORE_KEYS, COMMENT_REVIEW_SCORE_KEY]
    : REVIEW_SCORE_KEYS;
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
    platformLimits: isConversational ? null : platformLimitsForPrompt(platform),
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
    // B700: проход продолжает со склада, а не с чистого листа. Справка тоже
    // берётся оттуда — редактор обязан смотреть тот материал, который писал
    // автор, а не свежесобранный по тем же исходным данным.
    const carried = carriedWriterStage(publication.agentWriterDraft);
    const research = carried?.research ?? await buildMarketingResearchBrief(publication);
    const iterationHistory: EditorialIteration[] = carried ? [...carried.iterationHistory] : [];
    let approvedDraft: WriterOutput | null = null;
    let lastWriter: RoleStamp | null = carried?.pending?.writer
      ?? carried?.iterationHistory.at(-1)?.writer
      ?? null;
    let lastReviewer: RoleStamp | null = null;
    let previousDraft: WriterOutput | null = carried?.previousDraft ?? null;
    let previousReview: ReviewerOutput | null = carried?.previousReview ?? null;
    /** Написанное со склада: первый раунд прохода отдаёт его редактору как есть. */
    let pending = carried?.pending ?? null;

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
        repaired = { draft: pending.draft, repairs: pending.repairs, violations: [] };
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
          : marketingProviderOrder(`writer:${cycleSeed}`, [], availability.providers),
        maxTokens: MARKETING_WRITER_MAX_TOKENS,
        temperature: 0.45,
        attempts,
        requestId: `marketing-writer:${publication.id}:${publication.attemptCount + 1}:${round}`,
        messages: [
          { role: "system", content: MARKETING_AGENT_SYSTEM_PROMPT },
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
      });
      }
      const { draft, repairs, violations } = repaired;

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
          research,
          iterationHistory,
          previousDraft,
          previousReview,
          pending: null,
        });
        continue;
      }

      // B700: написанное ложится на склад ДО вызова редактора. Это и есть
      // граница двух операций конвейера: дальше отказ редактора стоит одного
      // вызова редактора, а не повторной оплаты автора.
      await carry({
        round,
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
      const rotated = marketingProviderOrder(`reviewer:${cycleSeed}`, [], availability.providers);
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
        requestId: `marketing-reviewer:${publication.id}:${publication.attemptCount + 1}:${round}`,
        messages: [
          { role: "system", content: MARKETING_REVIEWER_SYSTEM_PROMPT },
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
      const review = reviewerResult.value;
      iterationHistory.push({
        round,
        writer: { provider: writer.provider, model: writer.model },
        candidate: draft,
        repairs,
        reviewer: { provider: reviewer.provider, model: reviewer.model },
        review,
      });
      lastWriter = writer;
      lastReviewer = reviewer;

      if (approvedByScorecard(review, scoreKeys)) {
        approvedDraft = draft;
        break;
      }
      if (review.decision === "REJECT") break;
      previousDraft = draft;
      previousReview = review.decision === "APPROVE"
        ? {
          ...review,
          decision: "REVISE",
          issues: ["Формальная оценка ниже 4 — материал не может быть утверждён."],
          revisionBrief: ["Исправить параметры, получившие оценку ниже 4, и вернуть полный новый материал."],
        }
        : review;
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
    const updated = await db.externalPublication.update({
      where: { id: publication.id },
      data: {
        title: approvedDraft.title?.trim() || publication.title,
        body: approvedDraft.text.trim(),
        mediaUrl: isConversational
          ? null
          : `https://eterapy.com/api/marketing/media/${encodeURIComponent(publication.key)}`,
        status: nextStatus,
        // Ручная площадка не «публикуется сама» ни при каком выключателе:
        // дороги наружу у неё нет, и признак должен говорить это прямо.
        autoPublish: !isConversational && nextStatus === "SCHEDULED",
        attemptCount: { increment: 1 },
        lastError: null,
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
    maxAwaitingReview: MARKETING_MAX_AWAITING_REVIEW,
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
