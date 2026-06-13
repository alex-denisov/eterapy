import type { Prisma } from "@prisma/client";
import { appUrl, mainUrl } from "@/lib/subdomain";
import db from "@/lib/db";
import { dialogueTopicLabelRu } from "@/lib/dialogue-router";
import { stripMarkdown } from "@/lib/markdown";
import { tryParseChatAnalysis } from "@/lib/chat-analysis";
import { tryParsePerspectives } from "@/lib/perspectives";

// B373 (M26): «Моя карта» → Дневник. Этот слой собирает личную историю
// пользователя (диалоги, сохранённые результаты, маршруты) для страницы Дневника.
export type DiaryItemKind = "dialogue" | "product" | "route";

export type DiaryItem = {
  kind: DiaryItemKind;
  id: string;
  title: string;
  eyebrow: string;
  description: string;
  // T17: full Markdown body (untruncated) so diary surfaces can render formatted
  // prose instead of the cleaned one-line `description` preview.
  bodyMarkdown: string;
  href: string;
  updatedAt: Date;
  status: string;
  exportText: string;
  shareTopic: string;
  topic?: string;
  topicLabel?: string;
  // W13: whether this item is hidden from the diary (surfaced only when the
  // viewer asked to see hidden items, so they can un-hide it).
  hidden: boolean;
  // B363: library publish-consent state (dialogues only; null elsewhere).
  libraryConsentAt?: Date | null;
  libraryStatus?: string | null;
};

const PRODUCT_LABELS: Record<string, string> = {
  "deep-report": "Подробный разбор",
  perspectives: "Полная картина",
  "chat-analysis": "Разбор переписки",
  compatibility: "Совместимость",
  synastry: "Совместимость по звёздам",
  // B375 (M26): бесплатный итог недели ежедневной практики.
  "weekly-summary": "Итог недели",
};

function asJsonObject(value: Prisma.JsonValue | null | undefined): Prisma.JsonObject {
  if (!value || Array.isArray(value) || typeof value !== "object") return {};
  return value as Prisma.JsonObject;
}

export function mergeDiaryMetadata(value: Prisma.JsonValue | null | undefined, patch: Prisma.JsonObject): Prisma.JsonObject {
  return {
    ...asJsonObject(value),
    ...patch,
  };
}

export function isHiddenFromDiary(value: Prisma.JsonValue | null | undefined) {
  return asJsonObject(value).hiddenFromMap === true;
}

function truncate(text: string | null | undefined, fallback: string) {
  // T17: strip Markdown tokens so the one-line preview never shows raw "##"/"**".
  const clean = stripMarkdown(text);
  if (!clean) return fallback;
  return clean.length > 180 ? `${clean.slice(0, 180).trim()}...` : clean;
}

function looksLikeJson(text: string): boolean {
  const t = text.trim();
  return (t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"));
}

/**
 * T10: some products persist a STRUCTURED JSON result (chat-analysis tones,
 * perspectives angles) rather than markdown prose. Dumping that JSON into the
 * diary tile showed users raw `"label":"Уклончивый","pct":50}` noise. This turns
 * each known structured result into clean, human-readable prose, and guards
 * against ever surfacing raw JSON for any other product.
 */
function readableProductBody(
  productKey: string,
  resultText: string | null | undefined,
  previewText: string | null | undefined,
): { description: string; bodyMarkdown: string } {
  const raw = (resultText ?? "").trim();
  const fallback = "Сохранённый результат готов к просмотру.";

  if (productKey === "chat-analysis") {
    const parsed = tryParseChatAnalysis(raw) ?? tryParseChatAnalysis((previewText ?? "").trim());
    if (parsed) {
      const tones = parsed.tonesThem.slice(0, 3).map((t) => t.label).filter(Boolean).join(", ");
      const reply = parsed.replies.find((r) => r.text?.trim())?.text?.trim();
      const body = [
        parsed.insight,
        tones ? `Тон собеседника: ${tones}.` : "",
        reply ? `Бережный вариант ответа: «${reply}»` : "",
      ].filter(Boolean).join("\n\n");
      return { description: truncate(parsed.insight, fallback), bodyMarkdown: body };
    }
  }

  if (productKey === "perspectives") {
    const parsed = tryParsePerspectives(raw) ?? tryParsePerspectives((previewText ?? "").trim());
    if (parsed) {
      const body = parsed.angles
        .map((angle) => `**${angle.title}.** ${angle.ask || angle.step || (angle.options[0] ?? "")}`.trim())
        .filter(Boolean)
        .join("\n\n");
      const first = parsed.angles[0];
      return {
        description: truncate(first ? `${first.title}: ${first.ask || first.step}` : "", fallback),
        bodyMarkdown: body || (first?.title ?? ""),
      };
    }
  }

  // Generic guard: prefer the first non-JSON prose candidate; never leak JSON.
  const proseCandidate = [raw, (previewText ?? "").trim()].find((c) => c && !looksLikeJson(c)) ?? "";
  return {
    description: truncate(proseCandidate, fallback),
    bodyMarkdown: proseCandidate,
  };
}

export async function listDiaryItems(
  userId: string,
  options: { includeHidden?: boolean } = {},
): Promise<DiaryItem[]> {
  const includeHidden = options.includeHidden === true;
  const [dialogues, products, routes] = await Promise.all([
    db.dialogue.findMany({
      where: { userId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 40,
      select: {
        id: true,
        title: true,
        topic: true,
        status: true,
        metadata: true,
        updatedAt: true,
        libraryConsentAt: true,
        libraryStatus: true,
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { content: true },
        },
      },
    }),
    db.productResult.findMany({
      where: {
        userId,
        deletedAt: null,
        status: "READY",
        savedAt: { not: null },
      },
      orderBy: { updatedAt: "desc" },
      take: 40,
      select: {
        id: true,
        productKey: true,
        title: true,
        previewText: true,
        resultText: true,
        status: true,
        metadata: true,
        updatedAt: true,
      },
    }),
    db.clarityRoute.findMany({
      where: {
        userId,
        status: { not: "CANCELLED" },
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: {
        id: true,
        title: true,
        status: true,
        currentDay: true,
        metadata: true,
        updatedAt: true,
      },
    }),
  ]);

  const items: DiaryItem[] = [
    ...dialogues
      .filter((dialogue) => includeHidden || !isHiddenFromDiary(dialogue.metadata))
      .map((dialogue) => ({
        kind: "dialogue" as const,
        id: dialogue.id,
        title: dialogue.title,
        eyebrow: "Вопрос",
        description: truncate(dialogue.messages[0]?.content, "Диалог сохранён в вашем дневнике."),
        bodyMarkdown: dialogue.messages[0]?.content ?? "",
        href: mainUrl(`/checkin?dialogueId=${dialogue.id}`),
        updatedAt: dialogue.updatedAt,
        status: dialogue.status,
        exportText: `Вопрос: ${dialogue.title}\nСтатус: ${dialogue.status}\n${dialogue.messages[0]?.content ?? ""}`,
        shareTopic: dialogue.topic ?? "dialogue",
        // Z9: the diary uses Dialogue.topic as a first-class user-facing theme
        // source instead of the retired hard-coded /cabinet/map mock.
        topic: dialogue.topic ?? "other",
        topicLabel: dialogueTopicLabelRu(dialogue.topic),
        hidden: isHiddenFromDiary(dialogue.metadata),
        libraryConsentAt: dialogue.libraryConsentAt,
        libraryStatus: dialogue.libraryStatus,
      })),
    ...products
      .filter((product) => includeHidden || !isHiddenFromDiary(product.metadata))
      .map((product) => {
        const { description, bodyMarkdown } = readableProductBody(
          product.productKey,
          product.resultText,
          product.previewText,
        );
        return {
          kind: "product" as const,
          id: product.id,
          title: product.title,
          eyebrow: PRODUCT_LABELS[product.productKey] ?? "Результат",
          description,
          bodyMarkdown,
          href: appUrl(`/cabinet/results/${product.id}`),
          updatedAt: product.updatedAt,
          status: product.status,
          // Export keeps the readable prose too (never the raw JSON blob).
          exportText: `${PRODUCT_LABELS[product.productKey] ?? "Результат"}: ${product.title}\n${bodyMarkdown}`,
          shareTopic: product.productKey,
          hidden: isHiddenFromDiary(product.metadata),
        };
      }),
    ...routes
      .filter((route) => includeHidden || !isHiddenFromDiary(route.metadata))
      .map((route) => ({
        kind: "route" as const,
        id: route.id,
        title: route.title,
        eyebrow: "Маршрут",
        description: `День ${route.currentDay}. Статус: ${route.status === "PAUSED" ? "пауза" : route.status.toLowerCase()}.`,
        bodyMarkdown: "",
        href: appUrl("/cabinet/practice"),
        updatedAt: route.updatedAt,
        status: route.status,
        exportText: `Маршрут: ${route.title}\nДень: ${route.currentDay}\nСтатус: ${route.status}`,
        shareTopic: "route",
        hidden: isHiddenFromDiary(route.metadata),
      })),
  ];

  return items.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}
