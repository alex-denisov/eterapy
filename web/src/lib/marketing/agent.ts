import type { Prisma } from "@prisma/client";
import { aiComplete } from "@/lib/ai";
import db from "@/lib/db";
import { log, serializeError } from "@/lib/logger";
import {
  MARKETING_AGENT_SYSTEM_PROMPT,
  MARKETING_REVIEWER_SYSTEM_PROMPT,
} from "@/lib/marketing/agent-prompt";
import { requestMarketingModeration } from "@/lib/marketing/moderation";
import {
  marketingProviderFromLabel,
  marketingProviderOrder,
} from "@/lib/marketing/model-pool";

type WriterOutput = {
  title: string;
  text: string;
  audienceNeed: string;
  goal: string;
  disclosure: string;
  safetyFlags: string[];
};

type ReviewerOutput = {
  decision: "APPROVE" | "REVISE" | "REJECT";
  scores: Record<string, number>;
  issues: string[];
  revisedText: string;
  summary: string;
};

const LOOP_LIMIT = 3;

function jsonObject<T>(raw: string): T {
  const unfenced = raw.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const firstBrace = unfenced.indexOf("{");
  const lastBrace = unfenced.lastIndexOf("}");
  const candidate = firstBrace >= 0 && lastBrace > firstBrace
    ? unfenced.slice(firstBrace, lastBrace + 1)
    : unfenced;
  return JSON.parse(candidate) as T;
}

function jsonStringField(raw: string, field: string) {
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
      safetyFlags: [],
    };
  }
}

async function completeWithValidStructure<T>(input: {
  feature: "marketing-agent-writer" | "marketing-agent-reviewer";
  providerOrder: ReturnType<typeof marketingProviderOrder>;
  maxTokens: number;
  temperature: number;
  requestId: string;
  messages: Parameters<typeof aiComplete>[0]["messages"];
  parse: (raw: string) => T;
}) {
  const failures: string[] = [];
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
      failures.push(`${provider}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`No free provider returned valid structured output (${failures.join("; ")})`);
}

function safePlatform(value: string) {
  const normalized = value.trim().toLowerCase();
  return ["vk", "telegram", "reddit", "threads", "instagram"].includes(normalized)
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

  const isComment = publication.contentType === "COMMENT";
  const platform = safePlatform(publication.platform);
  // Public social content is part of the SMM task. Internal ETerapy user,
  // practitioner, dialogue, booking and session data is never attached here.
  const task = {
    kind: isComment ? "COMMENT" : "OWNED_POST",
    platform,
    title: publication.title,
    topic: publication.cluster ?? publication.targetQuery ?? "саморефлексия",
    destinationUrl: isComment ? null : publication.destinationUrl,
    publicPost: isComment ? {
      text: publication.engagementExcerpt,
      url: publication.engagementTargetUrl,
      label: publication.engagementTargetLabel,
      platformPostId: publication.engagementTargetId,
    } : null,
    scheduledFor: publication.scheduledFor?.toISOString() ?? null,
    revisionRequested: publication.status === "REVIEW",
  };

  try {
    const cycleSeed = `${publication.id}:${publication.attemptCount + 1}`;
    const writerResult = await completeWithValidStructure({
      feature: "marketing-agent-writer",
      providerOrder: marketingProviderOrder(`writer:${cycleSeed}`),
      maxTokens: 1_500,
      temperature: 0.55,
      requestId: `marketing-writer:${publication.id}:${publication.attemptCount + 1}`,
      messages: [
        { role: "system", content: MARKETING_AGENT_SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(task) },
      ],
      parse: (raw) => writerObject(raw, publication.title),
    });
    const writer = writerResult.response;
    const draft = writerResult.value;
    if (!draft.text?.trim() || (draft.safetyFlags?.length ?? 0) > 0) {
      throw new Error(`writer safety block: ${(draft.safetyFlags ?? []).join(", ") || "empty text"}`);
    }

    const writerProvider = marketingProviderFromLabel(writer.provider);
    const reviewerResult = await completeWithValidStructure({
      feature: "marketing-agent-reviewer",
      providerOrder: marketingProviderOrder(
        `reviewer:${cycleSeed}`,
        writerProvider ? [writerProvider] : [],
      ),
      maxTokens: 1_200,
      temperature: 0.1,
      requestId: `marketing-reviewer:${publication.id}:${publication.attemptCount + 1}`,
      messages: [
        { role: "system", content: MARKETING_REVIEWER_SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify({ task, candidate: draft }) },
      ],
      parse: jsonObject<ReviewerOutput>,
    });
    const reviewer = reviewerResult.response;
    if (writer.provider === reviewer.provider && writer.model === reviewer.model) {
      throw new Error("writer and reviewer resolved to the same model; configure separate model policies");
    }
    const review = reviewerResult.value;
    const approvedText = review.decision === "APPROVE"
      ? draft.text.trim()
      : review.decision === "REVISE"
        ? review.revisedText?.trim()
        : "";
    if (!approvedText) {
      await db.externalPublication.update({
        where: { id: publication.id },
        data: {
          status: "FAILED",
          lastError: review.summary || "Independent reviewer rejected the draft",
          attemptCount: { increment: 1 },
          agentWriterProvider: writer.provider,
          agentWriterModel: writer.model,
          agentReviewerProvider: reviewer.provider,
          agentReviewerModel: reviewer.model,
          agentReview: review as unknown as Prisma.InputJsonValue,
          agentReviewedAt: new Date(),
        },
      });
      return { status: "rejected" as const };
    }

    const nextStatus = isComment ? "REVIEW" : "SCHEDULED";
    const updated = await db.externalPublication.update({
      where: { id: publication.id },
      data: {
        title: draft.title?.trim() || publication.title,
        body: approvedText,
        status: nextStatus,
        autoPublish: !isComment,
        attemptCount: { increment: 1 },
        lastError: null,
        agentWriterProvider: writer.provider,
        agentWriterModel: writer.model,
        agentReviewerProvider: reviewer.provider,
        agentReviewerModel: reviewer.model,
        agentReview: review as unknown as Prisma.InputJsonValue,
        agentReviewedAt: new Date(),
      },
    });
    if (isComment) await requestMarketingModeration(updated.id);
    return { status: nextStatus.toLowerCase() as "review" | "scheduled" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.externalPublication.update({
      where: { id: publication.id },
      data: { status: "FAILED", lastError: message, attemptCount: { increment: 1 } },
    }).catch(() => undefined);
    await recordSignal({
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

export async function runMarketingAgentCycle() {
  if (!await marketingAgentEnabled()) {
    return { enabled: false, processed: 0 };
  }
  const drafts = await db.externalPublication.findMany({
    where: {
      OR: [
        { status: "DRAFT", agentReviewedAt: null },
        { status: "REVIEW", contentType: "COMMENT", lastError: "REVISION_REQUESTED" },
      ],
    },
    orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }],
    take: LOOP_LIMIT,
    select: { id: true },
  });
  for (const draft of drafts) await processMarketingDraft(draft.id);
  return { enabled: true, processed: drafts.length };
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
