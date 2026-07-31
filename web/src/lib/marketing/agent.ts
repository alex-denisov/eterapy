import type { AIProvider, Prisma } from "@prisma/client";
import { aiComplete } from "@/lib/ai";
import db from "@/lib/db";
import { log, serializeError } from "@/lib/logger";
import {
  MARKETING_AGENT_SYSTEM_PROMPT,
  MARKETING_REVIEWER_SYSTEM_PROMPT,
} from "@/lib/marketing/agent-prompt";
import {
  ENGAGEMENT_TONE_HARD_LIMITS,
  engagementToneById,
} from "@/lib/marketing/engagement-tone";
import { requestMarketingModeration } from "@/lib/marketing/moderation";
import {
  CONVERSATIONAL_CONTENT_TYPES,
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
import { DZEN_FEED_MINIMUM_ITEMS, dzenFeedItems } from "@/lib/marketing/dzen-feed";
import { buildMarketingResearchBrief } from "@/lib/marketing/research";

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

const CAPACITY_ERROR_MARKERS = [
  "daily token budget exceeded",
  "rate limit",
  "rate_limit",
  "quota",
  "429",
  "insufficient_quota",
];

export function isCapacityError(error: unknown): boolean {
  if (error instanceof MarketingCapacityError) return true;
  if (error instanceof Error && error.name === "AIBudgetExceededError") return true;
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return CAPACITY_ERROR_MARKERS.some((marker) => message.includes(marker));
}

/**
 * Отказ, который пройдёт сам: кончилась ёмкость или в пуле не осталось второй
 * независимой модели. Такая строка остаётся черновиком и уходит в следующий
 * проход — FAILED здесь означал бы «материал негоден», а он не при чём.
 */
export function isDeferrableError(error: unknown): boolean {
  return isCapacityError(error) || error instanceof MarketingModelSeparationError;
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
  field: "destinationUrl" | "cta";
  note: string;
}

export function repairPublishableDraft(input: {
  draft: WriterOutput;
  isConversational: boolean;
  destinationUrl: string | null;
  platform: string;
}): { draft: WriterOutput; repairs: DraftRepair[] } {
  const text = input.draft.text?.trim() ?? "";
  if (!text || (input.draft.safetyFlags?.length ?? 0) > 0) {
    throw new Error(`writer safety block: ${(input.draft.safetyFlags ?? []).join(", ") || "empty text"}`);
  }
  if (input.isConversational) return { draft: { ...input.draft, text }, repairs: [] };
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

  if (input.platform === "telegram" && repairedText.length > 1_000) {
    throw new Error("Telegram publication exceeds the 1000-character media caption budget");
  }
  if (input.platform === "threads" && repairedText.length > 480) {
    throw new Error("Threads publication exceeds the 480-character editorial budget");
  }
  if (["telegram", "instagram", "dzen"].includes(input.platform) && !input.draft.mediaBrief?.trim()) {
    throw new Error(`${input.platform} publication omitted the required media brief`);
  }
  return { draft: { ...input.draft, text: repairedText, cta }, repairs };
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
}) {
  const failures: string[] = [];
  let capacityFailures = 0;
  let separationFailures = 0;
  for (const provider of input.providerOrder) {
    try {
      const response = await aiComplete({
        feature: input.feature,
        dataClass: "PUBLIC_MARKETING",
        providerOrder: [provider],
        maxTokens: input.maxTokens,
        temperature: input.temperature,
        requestId: `${input.requestId}:${provider.toLowerCase()}`,
        messages: input.messages,
      });
      assertFreshMarketingModel(response.model);
      if (input.excludeModel && response.model === input.excludeModel) {
        separationFailures += 1;
        failures.push(`${provider}: resolved to the writer's model ${response.model}`);
        continue;
      }
      try {
        return { response, value: input.parse(response.text) };
      } catch (error) {
        failures.push(`${provider}: ${error instanceof Error ? error.message : String(error)}`);
        log.warn("marketing-agent.invalid-structured-output", {
          feature: input.feature,
          provider,
          model: response.model,
        });
      }
    } catch (error) {
      if (isCapacityError(error)) capacityFailures += 1;
      failures.push(`${provider}: ${error instanceof Error ? error.message : String(error)}`);
    }
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
  };

  try {
    const cycleSeed = `${publication.id}:${publication.attemptCount + 1}`;
    const research = await buildMarketingResearchBrief(publication);
    const iterationHistory: Array<{
      round: number;
      writer: { provider: string; model: string };
      candidate: WriterOutput;
      /** B623: что дописала система за автора — видно и редактору, и в кокпите. */
      repairs: DraftRepair[];
      reviewer: { provider: string; model: string };
      review: ReviewerOutput;
    }> = [];
    let approvedDraft: WriterOutput | null = null;
    let lastWriter: Awaited<ReturnType<typeof aiComplete>> | null = null;
    let lastReviewer: Awaited<ReturnType<typeof aiComplete>> | null = null;
    let previousDraft: WriterOutput | null = null;
    let previousReview: ReviewerOutput | null = null;

    for (let round = 1; round <= EDITORIAL_ROUND_LIMIT; round += 1) {
      const pinnedWriterProvider: AIProvider | null = lastWriter
        ? marketingProviderFromLabel(lastWriter.provider)
        : null;
      const writerPrompt: Record<string, unknown> = previousDraft && previousReview
        ? {
          task,
          research,
          editorialRound: round,
          previousCandidate: previousDraft,
          editorIssues: previousReview.issues,
          revisionBrief: previousReview.revisionBrief,
          instruction: "Исправь все замечания редактора и верни полностью готовую новую версию в обязательном JSON-формате.",
        }
        : { task, research, editorialRound: round };
      const writerResult: StructuredCompletion<WriterOutput> = await completeWithValidStructure({
        // B628: разговорный материал списывается с отдельной суточной ёмкости.
        feature: isConversational ? MARKETING_REPLY_WRITER_FEATURE : "marketing-agent-writer",
        providerOrder: pinnedWriterProvider
          ? [pinnedWriterProvider]
          : marketingProviderOrder(`writer:${cycleSeed}`),
        maxTokens: 2_200,
        temperature: 0.45,
        requestId: `marketing-writer:${publication.id}:${publication.attemptCount + 1}:${round}`,
        messages: [
          { role: "system", content: MARKETING_AGENT_SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(writerPrompt) },
        ],
        parse: (raw) => writerObject(raw, publication.title),
      });
      const writer: AICompletion = writerResult.response;
      const { draft, repairs } = repairPublishableDraft({
        draft: writerResult.value,
        isConversational,
        destinationUrl: publication.destinationUrl,
        platform,
      });

      // B623: редактор предпочитает другого провайдера, но окончательный
      // критерий — другая МОДЕЛЬ. Провайдер автора остаётся в конце очереди как
      // последний вариант: он допустим, если отдаст не ту же модель.
      const writerProvider = marketingProviderFromLabel(writer.provider);
      const rotated = marketingProviderOrder(`reviewer:${cycleSeed}`);
      const reviewerProviderOrder = [
        ...rotated.filter((provider) => provider !== writerProvider),
        ...rotated.filter((provider) => provider === writerProvider),
      ];
      const reviewerResult = await completeWithValidStructure({
        feature: isConversational ? MARKETING_REPLY_REVIEWER_FEATURE : "marketing-agent-reviewer",
        providerOrder: reviewerProviderOrder,
        excludeModel: writer.model,
        maxTokens: 1_600,
        temperature: 0.05,
        requestId: `marketing-reviewer:${publication.id}:${publication.attemptCount + 1}:${round}`,
        messages: [
          { role: "system", content: MARKETING_REVIEWER_SYSTEM_PROMPT },
          {
            role: "user",
            content: JSON.stringify({
              task,
              research,
              editorialRound: round,
              candidate: draft,
              systemRepairs: repairs,
            }),
          },
        ],
        parse: (raw) => reviewerObject(raw, scoreKeys),
      });
      const reviewer = reviewerResult.response;
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
        },
      });
      return { status: "rejected" as const };
    }

    const nextStatus = isConversational ? "REVIEW" : "SCHEDULED";
    const updated = await db.externalPublication.update({
      where: { id: publication.id },
      data: {
        title: approvedDraft.title?.trim() || publication.title,
        body: approvedDraft.text.trim(),
        mediaUrl: isConversational
          ? null
          : `https://eterapy.com/api/marketing/media/${encodeURIComponent(publication.key)}`,
        status: nextStatus,
        autoPublish: !isConversational,
        attemptCount: { increment: 1 },
        lastError: null,
        agentWriterProvider: lastWriter.provider,
        agentWriterModel: lastWriter.model,
        agentReviewerProvider: lastReviewer.provider,
        agentReviewerModel: lastReviewer.model,
        agentReview: { research, iterations: iterationHistory } as unknown as Prisma.InputJsonValue,
        agentReviewedAt: new Date(),
      },
    });
    if (isConversational) await requestMarketingModeration(updated.id);
    await resolveMarketingSignal(`agent-draft:${publication.id}`).catch(() => undefined);
    // Прошла хоть одна генерация — ёмкость вернулась.
    await resolveMarketingSignal("agent:capacity").catch(() => undefined);
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
        ? { lastError: message }
        : { status: "FAILED", lastError: message, attemptCount: { increment: 1 } },
    }).catch(() => undefined);
    await recordSignal(deferrable
      ? {
        // Один сигнал на исчерпание, а не инцидент на каждый пост: иначе
        // кокпит владельца заливает сотней одинаковых строк.
        key: "agent:capacity",
        kind: "AGENT_RUN",
        severity: "WARNING",
        // B638: заголовок называет ПРИЧИНУ, а не первое подвернувшееся слово.
        // «Кончилась ёмкость провайдеров» стояло и тогда, когда провайдеры были
        // здоровы, а упёрлись мы в собственный суточный потолок — владелец шёл
        // проверять ключи вместо того, чтобы поднять число у себя. Тот же класс
        // ошибки, что стухшая отметка в панели провайдеров: панель называла не
        // ту причину.
        title: error instanceof MarketingModelSeparationError
          ? "SMM-агент ждёт вторую независимую модель"
          : isOwnBudgetCeiling(message)
            ? "SMM-агент остановлен: упёрся в наш суточный потолок токенов"
            : "SMM-агент остановлен: провайдеры отказали в ёмкости",
        summary: isOwnBudgetCeiling(message)
          ? `${message} — это НАШ потолок (\`dailyTokenBudget\` в task-policy), а не квота провайдера. `
            + "Ключи и аккаунты проверять не нужно."
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
    return { status: "failed" as const, error: message };
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
 * B629 — сколько плановых материалов агент имеет право написать за час.
 *
 * Окно опережения в 30 часов (B625) не мешает написать всю суточную норму за
 * один проход в полночь: замер прода показал 78 запросов подряд за 2,5 часа.
 * Суточный потолок при этом формально не нарушен, но ёмкость выгорает пачкой, и
 * дальше сутки идут без единой генерации. Часовой шаг превращает потолок в
 * норму расхода: плану достаточно двух материалов в час, чтобы к слоту всё было
 * готово, а ответам людям остаётся и ёмкость, и очередь.
 */
export const MARKETING_PLANNED_DRAFTS_PER_HOUR = Math.max(
  1,
  Number(process.env.MARKETING_PLANNED_DRAFTS_PER_HOUR || 2),
);

/** Разговорные материалы идут вне часового шага: ответ нельзя отложить. */
const CONVERSATIONAL_LOOP_LIMIT = 3;

export async function runMarketingAgentCycle(input: { now?: Date } = {}) {
  if (!await marketingAgentEnabled()) {
    return { enabled: false, processed: 0, deferred: 0, conversational: 0, planned: 0, paced: 0 };
  }
  const now = input.now ?? new Date();
  const horizon = marketingGenerationHorizon(now);
  // Материал без плановой даты — это ответ на входящее или ручной черновик:
  // ждать нечего, он идёт в этот же проход.
  const dueNow = {
    OR: [{ scheduledFor: null }, { scheduledFor: { lte: horizon } }],
  };
  const readyForWork = {
    OR: [
      { status: "DRAFT", agentReviewedAt: null },
      {
        status: "REVIEW",
        contentType: { in: [...CONVERSATIONAL_CONTENT_TYPES] },
        lastError: "REVISION_REQUESTED",
      },
    ],
  };
  const conversationalFilter = { contentType: { in: [...CONVERSATIONAL_CONTENT_TYPES] } };
  const plannedFilter = { NOT: conversationalFilter };

  // Разговорное — первым и всегда: у него отдельная ёмкость и отдельный смысл
  // срочности. Плановое берётся тем, что осталось от часового шага.
  const conversational = await db.externalPublication.findMany({
    where: { AND: [readyForWork, dueNow, conversationalFilter] },
    orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }],
    take: CONVERSATIONAL_LOOP_LIMIT,
    select: { id: true },
  });

  const hourAgo = new Date(now.getTime() - 60 * 60_000);
  const [plannedThisHour, deferred] = await Promise.all([
    db.externalPublication.count({
      where: { AND: [plannedFilter, { agentReviewedAt: { gte: hourAgo } }] },
    }),
    db.externalPublication.count({
      where: { AND: [readyForWork, { scheduledFor: { gt: horizon } }] },
    }),
  ]);
  const plannedBudget = Math.max(0, Math.min(
    LOOP_LIMIT,
    MARKETING_PLANNED_DRAFTS_PER_HOUR - plannedThisHour,
  ));
  /**
   * B632 — исключение с условием окончания.
   *
   * Дзен не подключает ленту, пока в ней меньше десяти материалов, а окно
   * опережения в 30 часов даёт примерно по одному материалу Дзена в сутки: лента
   * набралась бы за полторы недели, и всё это время задача владельца
   * «подключить Дзен» стояла бы в ожидании. Пока лента недобрана, черновики
   * Дзена берутся вне окна — но внутри того же часового шага, поэтому это не
   * возврат к пачке. Условие снимается само на десятом материале.
   *
   * Проверка делается только тогда, когда норма часа не исчерпана: иначе это
   * лишний запрос в базу на каждом тике воркера.
   */
  const plannedDue = plannedBudget > 0 && await dzenFeedItems(DZEN_FEED_MINIMUM_ITEMS)
    .then((items) => items.length < DZEN_FEED_MINIMUM_ITEMS)
    .catch(() => false)
    ? { OR: [dueNow, { platform: "dzen" }] }
    : dueNow;
  const planned = plannedBudget > 0
    ? await db.externalPublication.findMany({
      where: { AND: [readyForWork, plannedDue, plannedFilter] },
      orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }],
      take: plannedBudget,
      select: { id: true },
    })
    : [];
  // «Отложено часовым шагом» — отдельное число: иначе пустая очередь и
  // сработавший пейсинг снаружи выглядят одинаково.
  const paced = plannedBudget > 0
    ? 0
    : await db.externalPublication.count({
      where: { AND: [readyForWork, plannedDue, plannedFilter] },
    });

  for (const draft of [...conversational, ...planned]) await processMarketingDraft(draft.id);
  return {
    enabled: true,
    processed: conversational.length + planned.length,
    conversational: conversational.length,
    planned: planned.length,
    deferred,
    paced,
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
