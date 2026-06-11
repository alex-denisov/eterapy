import type { Prisma } from "@prisma/client";
import { aiComplete } from "@/lib/ai";
import { log, serializeError } from "@/lib/logger";
import { stripMarkdown } from "@/lib/markdown";
import { listMyMapItems, type MyMapItem } from "@/lib/my-map";

export const MIN_EXTENDED_MAP_ITEMS = 3;

type ExtendedMapReady = {
  status: "ready";
  text: string;
  items: MyMapItem[];
  itemCount: number;
  metadata: Prisma.InputJsonObject;
};

type ExtendedMapInsufficient = {
  status: "insufficient_history";
  items: MyMapItem[];
  itemCount: number;
  minItems: number;
  missingCount: number;
  emptyState: string;
  metadata: Prisma.InputJsonObject;
};

export type ExtendedMapGenerationResult = ExtendedMapReady | ExtendedMapInsufficient;

function normalize(text: string | null | undefined, max = 6000) {
  return (text ?? "").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
}

function cleanLine(line: string) {
  return stripMarkdown(line)
    .replace(/^(центральная тема|главная тема|тема|повторяющаяся тема)\s*[:—-]\s*/i, "")
    .trim();
}

export function buildExtendedMapEmptyState(itemCount: number) {
  const missing = Math.max(0, MIN_EXTENDED_MAP_ITEMS - itemCount);
  return [
    `Чтобы собрать расширенную карту, нужно хотя бы ${MIN_EXTENDED_MAP_ITEMS} сохранённых элемента в Моей карте.`,
    missing > 0
      ? `Сейчас есть ${itemCount}; сохраните ещё ${missing} вопрос(а), маршрут или результат разбора.`
      : "Истории уже достаточно — можно собрать карту.",
  ].join(" ");
}

function topicSummary(items: MyMapItem[]) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = item.topicLabel || item.eyebrow || item.shareTopic || "Тема";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count]) => `${label}: ${count}`)
    .join("; ");
}

function sourceItemDigest(items: MyMapItem[]) {
  return items.slice(0, 24).map((item, index) => {
    const body = normalize(item.bodyMarkdown || item.description || item.exportText, 700);
    return [
      `${index + 1}. ${item.eyebrow}: ${item.title}`,
      item.topicLabel ? `Тема: ${item.topicLabel}` : "",
      `Кратко: ${normalize(item.description, 260)}`,
      body ? `Фрагмент: ${body}` : "",
    ].filter(Boolean).join("\n");
  }).join("\n\n");
}

function heuristicExtendedMapResult(items: MyMapItem[]) {
  const topTopic = topicSummary(items).split(";")[0]?.split(":")[0]?.trim() || "повторяющиеся темы";
  return [
    "Расширенная карта ETerapy",
    "",
    `Центральная тема: ${topTopic.toLowerCase()} возвращались чаще других и просили больше внимания, границ и спокойного темпа.`,
    "Что стало тише: необходимость решать всё сразу и объяснять себя без паузы.",
    "Что окрепло: способность замечать повтор до того, как он превращается в автоматическую реакцию.",
    "",
    "Следующий шаг: выберите один разговор или решение, где можно действовать медленнее и честнее, чем раньше.",
  ].join("\n");
}

export function buildExtendedMapTeaser(input: { items: MyMapItem[]; generatedText: string }) {
  const generatedLines = input.generatedText
    .split("\n")
    .map((line) => cleanLine(line))
    .filter(Boolean);
  const candidate = generatedLines.find((line) => /границ|голос|тем|выбор|отнош|работ|семь|вина|темп/i.test(line))
    ?? generatedLines.find((line) => !/^расширенная карта/i.test(line))
    ?? `В истории чаще всего звучит: ${topicSummary(input.items) || "одна повторяющаяся тема"}.`;

  return [
    "1 тема из вашей истории",
    candidate,
    "",
    "Полная расширенная карта соберёт годовую динамику, ослабшие темы, укрепившиеся сценарии и один следующий шаг.",
  ].join("\n");
}

export async function getExtendedMapHistorySnapshot(userId: string) {
  const items = await listMyMapItems(userId);
  return {
    items,
    itemCount: items.length,
    minItems: MIN_EXTENDED_MAP_ITEMS,
    canGenerate: items.length >= MIN_EXTENDED_MAP_ITEMS,
    missingCount: Math.max(0, MIN_EXTENDED_MAP_ITEMS - items.length),
  };
}

export async function generateExtendedMapResult(input: {
  userId: string;
  requestId?: string;
}): Promise<ExtendedMapGenerationResult> {
  const snapshot = await getExtendedMapHistorySnapshot(input.userId);
  if (!snapshot.canGenerate) {
    return {
      status: "insufficient_history",
      items: snapshot.items,
      itemCount: snapshot.itemCount,
      minItems: MIN_EXTENDED_MAP_ITEMS,
      missingCount: snapshot.missingCount,
      emptyState: buildExtendedMapEmptyState(snapshot.itemCount),
      metadata: {
        source: "history",
        sourceItemCount: snapshot.itemCount,
        minItems: MIN_EXTENDED_MAP_ITEMS,
        fallbackReason: "insufficient_history",
      },
    };
  }

  const fallback = heuristicExtendedMapResult(snapshot.items);
  try {
    const response = await aiComplete({
      feature: "product-my-map",
      userId: input.userId,
      requestId: input.requestId,
      maxTokens: 1600,
      temperature: 0.45,
      messages: [
        {
          role: "system",
          content: [
            "Write a paid ETerapy extended map result in Russian.",
            "Use only the supplied saved history; do not invent private events.",
            "Find repeating themes, what softened, what strengthened, and one practical next step.",
            "Be warm, concrete, non-fatalistic, non-diagnostic, and avoid medical/legal/financial instructions.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            `Saved item count: ${snapshot.itemCount}`,
            `Topic summary: ${topicSummary(snapshot.items) || "нет явной темы"}`,
            "Saved history:",
            sourceItemDigest(snapshot.items),
          ].join("\n\n"),
        },
      ],
    });

    const text = normalize(response.text);
    const finalText = text.length >= 220 ? text : fallback;
    const metadata: Prisma.InputJsonObject = {
      source: text.length >= 220 ? "ai" : "heuristic",
      ...(text.length < 220 ? { fallbackReason: "short_ai_response" } : {}),
      provider: response.provider,
      model: response.model,
      tokensIn: response.tokensIn,
      tokensOut: response.tokensOut,
      latencyMs: response.latencyMs,
      sourceItemCount: snapshot.itemCount,
      sourceItemIds: snapshot.items.map((item) => item.id),
    };

    return {
      status: "ready",
      text: finalText,
      items: snapshot.items,
      itemCount: snapshot.itemCount,
      metadata,
    };
  } catch (error) {
    log.warn("extended-map-product-fallback", {
      requestId: input.requestId,
      error: serializeError(error),
    });
    return {
      status: "ready",
      text: fallback,
      items: snapshot.items,
      itemCount: snapshot.itemCount,
      metadata: {
        source: "heuristic",
        fallbackReason: "ai_error",
        sourceItemCount: snapshot.itemCount,
        sourceItemIds: snapshot.items.map((item) => item.id),
      },
    };
  }
}
