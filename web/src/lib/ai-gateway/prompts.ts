import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import db from "@/lib/db";
import { logAudit } from "@/lib/audit";
import type { AIGatewayMessage, AIGatewayMessageContent } from "@/lib/ai-gateway/domain";
import { normalizeAIFeatureKey } from "@/lib/ai-gateway/domain";
import { listDefaultAITaskPolicies } from "@/lib/ai-gateway/task-policy";
import { log, serializeError } from "@/lib/logger";

const MAX_PROMPT_LENGTH = 30_000;
const MAX_AUDIT_TEXT_LENGTH = 20_000;

export interface AIPromptConfigView {
  id: string;
  feature: string;
  title: string;
  productKey: string | null;
  promptText: string;
  enabled: boolean;
  source: "default" | "database";
  updatedAt: Date | null;
  metadata?: Prisma.JsonValue | null;
}

export interface UpdateAIPromptConfigInput {
  feature: string;
  title?: string;
  productKey?: string | null;
  promptText: string;
  enabled?: boolean;
}

const DEFAULT_SYSTEM_PROMPTS: Record<string, string> = {
  "dialogue-primary-answer": [
    "You write ETerapy's free primary answer after clarifying questions.",
    "Write in Russian. Be warm, specific, and concise.",
    "Use short sections: Короткий ответ, Что кажется важным, Мягкий следующий шаг, Если хочется глубже.",
    "In «Если хочется глубже», recommend one relevant ETerapy deepening as an optional next layer: 4 ракурса ответа, Глубокий отчёт, Разбор переписки, Совместимость, or 7 дней к ясности.",
    "Do not hard-sell, pressure, diagnose, predict guaranteed outcomes, manipulate, or shame.",
    "For medical, legal, financial, emergency, or safety topics, include safe redirect copy.",
  ].join(" "),
  "dialogue-clarifier": [
    "Dynamic ETerapy clarifier prompt.",
    "It asks one warm, specific question per turn, mirrors the user's last phrase, returns JSON with q/c, and may return ready only after the minimum clarifying turns.",
    "Keep responses non-diagnostic, concrete, and in Russian.",
  ].join(" "),
  "dialogue-router": "Classify an ETerapy user question. Return only JSON with topic, difficulty, confidence. Do not answer the user question.",
  "safety-classification": "Classify ETerapy user safety risk. Return only JSON with level, reason, confidence. Use crisis/blocked conservatively. Do not answer the user question.",
  "product-perspectives": [
    "You are ETerapy. Write a 4-angles reflection for the user's dialogue in Russian.",
    "Return ONLY valid JSON with angles for Разум, Чувства, Символ, Действие.",
    "Be concrete, warm, non-diagnostic, non-fatalistic. No markdown inside JSON strings.",
  ].join(" "),
  "product-deep-report": [
    "Write an ETerapy paid Deep Report in Russian.",
    "Use sections: Обзор ситуации, Главная развилка, Риски, Возможности, План на 24-72 часа, Бережное резюме.",
    "Be specific to the dialogue, warm, non-fatalistic, and safe.",
    "Do not diagnose, manipulate, promise outcomes, or replace medical/legal/financial help.",
  ].join(" "),
  "product-chat-analysis-ocr": [
    "Extract chat text from a screenshot for ETerapy.",
    "Return only the recognized conversation text, preserving message order and speaker labels when visible.",
    "Do not analyze the conversation. Do not infer hidden content. If text is unreadable, return an empty string.",
  ].join(" "),
  "product-chat-analysis": [
    "You are ETerapy. Analyze the chat conversation in Russian.",
    "Return ONLY valid JSON with insight, tonesThem, tonesMe, replies, safetyNote.",
    "Do not state the other person's intent as fact. Never state psychological diagnoses as facts.",
  ].join(" "),
  "product-compatibility": [
    "Write ETerapy's paid Compatibility result in Russian.",
    "Analyze the two provided perspectives on a relationship.",
    "Use sections: Точки пересечения, Зоны напряжения, Потенциал развития, Рекомендация.",
    "Be objective, safe, and non-fatalistic. Do not diagnose.",
  ].join(" "),
  "product-seven-days-report": [
    "Write ETerapy's paid 7 Days to Clarity final report in Russian.",
    "Summarize the user's journey over 7 days based on their initial dialogue.",
    "Use sections: Основной фокус, Обнаруженные паттерны, Дальнейшие шаги.",
    "Be encouraging and reflective.",
  ].join(" "),
  "product-symbolic": [
    "Write a paid ETerapy symbolic product result in Russian.",
    "Be warm, concrete, non-fatalistic and ethical.",
    "Do not predict the future as fact. Do not diagnose. Do not give medical, legal or financial instructions.",
    "Use short sections and always end with one practical next step.",
  ].join(" "),
  "session-compliance": [
    "You are ETerapy's practitioner compliance reviewer.",
    "Return only JSON with riskScore, riskFlags, severity, summary, evidenceQuotes, moderatorRecommendation.",
    "Do not make a final sanction decision. Human moderator decides.",
  ].join(" "),
  "session-summary": [
    "Write a Russian ETerapy post-session package for a practitioner.",
    "Return only JSON with practitionerNotesText, clientFollowupDraft, summaryText.",
    "No diagnoses, no guarantees, no regulated medical/legal/financial advice.",
  ].join(" "),
};

function productKeyForFeature(feature: string) {
  if (feature === "dialogue-primary-answer" || feature === "dialogue-clarifier" || feature === "dialogue-router") return "checkin";
  if (feature.startsWith("product-")) return feature.replace(/^product-/, "");
  if (feature.startsWith("session-")) return "practitioner-session";
  if (feature.includes("safety")) return "safety";
  return null;
}

export function defaultPromptTextForFeature(feature: string) {
  const normalized = normalizeAIFeatureKey(feature);
  return DEFAULT_SYSTEM_PROMPTS[normalized] ?? [
    "Use the current ETerapy system prompt from code.",
    "You may include {{defaultPrompt}} in a custom prompt to preserve the latest code-level default text at runtime.",
    "",
    "{{defaultPrompt}}",
  ].join("\n");
}

function defaultPromptViews(): AIPromptConfigView[] {
  return listDefaultAITaskPolicies().map((policy) => ({
    id: `default:${policy.feature}`,
    feature: policy.feature,
    title: policy.title,
    productKey: productKeyForFeature(policy.feature),
    promptText: defaultPromptTextForFeature(policy.feature),
    enabled: true,
    source: "default",
    updatedAt: null,
    metadata: {
      tier: policy.tier,
      purpose: policy.purpose,
      fallbackNotes: policy.fallbackNotes,
    },
  }));
}

export async function listAIPromptConfigs(): Promise<AIPromptConfigView[]> {
  const rows = await db.aIPromptConfig.findMany({ orderBy: { feature: "asc" } });
  const byFeature = new Map(rows.map((row) => [normalizeAIFeatureKey(row.feature), row]));

  const defaults = defaultPromptViews().map((item) => {
    const row = byFeature.get(normalizeAIFeatureKey(item.feature));
    if (!row) return item;
    return {
      id: row.id,
      feature: row.feature,
      title: row.title,
      productKey: row.productKey,
      promptText: row.promptText,
      enabled: row.enabled,
      source: "database" as const,
      updatedAt: row.updatedAt,
      metadata: row.metadata,
    };
  });

  const known = new Set(defaults.map((item) => normalizeAIFeatureKey(item.feature)));
  const custom = rows
    .filter((row) => !known.has(normalizeAIFeatureKey(row.feature)))
    .map((row): AIPromptConfigView => ({
      id: row.id,
      feature: row.feature,
      title: row.title,
      productKey: row.productKey,
      promptText: row.promptText,
      enabled: row.enabled,
      source: "database",
      updatedAt: row.updatedAt,
      metadata: row.metadata,
    }));

  return [...defaults, ...custom].sort((a, b) => a.feature.localeCompare(b.feature));
}

export async function updateAIPromptConfig(actorId: string, input: UpdateAIPromptConfigInput): Promise<AIPromptConfigView> {
  const feature = normalizeAIFeatureKey(input.feature);
  const promptText = input.promptText.trim();
  if (!promptText) throw new Error("Prompt text is required");
  if (promptText.length > MAX_PROMPT_LENGTH) throw new Error("Prompt text is too long");

  const defaultView = defaultPromptViews().find((item) => normalizeAIFeatureKey(item.feature) === feature);
  const row = await db.aIPromptConfig.upsert({
    where: { feature },
    create: {
      feature,
      title: input.title?.trim() || defaultView?.title || feature,
      productKey: input.productKey ?? defaultView?.productKey ?? null,
      promptText,
      enabled: input.enabled ?? true,
      metadata: {
        updatedBy: actorId,
        defaultPromptAvailable: Boolean(defaultView),
      },
    },
    update: {
      title: input.title?.trim() || defaultView?.title || feature,
      productKey: input.productKey ?? defaultView?.productKey ?? null,
      promptText,
      enabled: input.enabled ?? true,
      metadata: {
        updatedBy: actorId,
        defaultPromptAvailable: Boolean(defaultView),
      },
    },
  });

  await logAudit(actorId, "AI_PROMPT_UPDATE", row.id, JSON.stringify({
    feature,
    enabled: row.enabled,
    title: row.title,
    promptLength: row.promptText.length,
  }));

  return {
    id: row.id,
    feature: row.feature,
    title: row.title,
    productKey: row.productKey,
    promptText: row.promptText,
    enabled: row.enabled,
    source: "database",
    updatedAt: row.updatedAt,
    metadata: row.metadata,
  };
}

function firstSystemIndex(messages: AIGatewayMessage[]) {
  return messages.findIndex((message) => message.role === "system");
}

function textFromContent(content: AIGatewayMessageContent) {
  if (typeof content === "string") return content;
  return content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n\n");
}

export async function applyAIPromptOverride(feature: string, messages: AIGatewayMessage[]): Promise<AIGatewayMessage[]> {
  const normalized = normalizeAIFeatureKey(feature);
  try {
    const row = await db.aIPromptConfig.findUnique({ where: { feature: normalized } });
    if (!row || !row.enabled) return messages;

    const systemIndex = firstSystemIndex(messages);
    const defaultPrompt = systemIndex >= 0 ? textFromContent(messages[systemIndex].content) : defaultPromptTextForFeature(normalized);
    const promptText = row.promptText.includes("{{defaultPrompt}}")
      ? row.promptText.replaceAll("{{defaultPrompt}}", defaultPrompt)
      : row.promptText;

    const next = [...messages];
    if (systemIndex >= 0) {
      next[systemIndex] = { ...next[systemIndex], content: promptText };
    } else {
      next.unshift({ role: "system", content: promptText });
    }
    return next;
  } catch (error) {
    log.warn("ai-prompt-override-failed", {
      feature: normalized,
      error: serializeError(error),
    });
    return messages;
  }
}

function auditText(text: string) {
  return text.slice(0, MAX_AUDIT_TEXT_LENGTH);
}

function serializeContentForAdmin(content: AIGatewayMessageContent): Prisma.InputJsonValue {
  if (typeof content === "string") return auditText(content);
  return content.map((block) => {
    if (block.type === "text") return { type: "text", text: auditText(block.text) };
    const url = block.image_url.url;
    return {
      type: "image_url",
      hasImage: true,
      dataUrl: url.startsWith("data:"),
      sha256: createHash("sha256").update(url).digest("hex"),
      preview: url.startsWith("data:") ? (url.match(/^data:([^;]+);base64,/)?.[1] ?? "data-url-image") : auditText(url),
    };
  });
}

export function serializeAIMessagesForAdmin(messages: AIGatewayMessage[]): Prisma.InputJsonValue {
  return messages.map((message) => ({
    role: message.role,
    content: serializeContentForAdmin(message.content),
  }));
}
