import type { Prisma } from "@prisma/client";
import { appUrl, mainUrl } from "@/lib/subdomain";
import db from "@/lib/db";

export type MyMapItemKind = "dialogue" | "product" | "route";

export type MyMapItem = {
  kind: MyMapItemKind;
  id: string;
  title: string;
  eyebrow: string;
  description: string;
  href: string;
  updatedAt: Date;
  status: string;
  exportText: string;
  shareTopic: string;
};

const PRODUCT_LABELS: Record<string, string> = {
  "deep-report": "Глубокий отчет",
  perspectives: "4 ракурса",
  "chat-analysis": "Разбор переписки",
  compatibility: "Совместимость",
  "seven-days": "7 дней к ясности",
};

function asJsonObject(value: Prisma.JsonValue | null | undefined): Prisma.JsonObject {
  if (!value || Array.isArray(value) || typeof value !== "object") return {};
  return value as Prisma.JsonObject;
}

export function mergeMapMetadata(value: Prisma.JsonValue | null | undefined, patch: Prisma.JsonObject): Prisma.JsonObject {
  return {
    ...asJsonObject(value),
    ...patch,
  };
}

export function isHiddenFromMap(value: Prisma.JsonValue | null | undefined) {
  return asJsonObject(value).hiddenFromMap === true;
}

function truncate(text: string | null | undefined, fallback: string) {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return fallback;
  return clean.length > 180 ? `${clean.slice(0, 180).trim()}...` : clean;
}

export async function listMyMapItems(userId: string): Promise<MyMapItem[]> {
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

  const items: MyMapItem[] = [
    ...dialogues
      .filter((dialogue) => !isHiddenFromMap(dialogue.metadata))
      .map((dialogue) => ({
        kind: "dialogue" as const,
        id: dialogue.id,
        title: dialogue.title,
        eyebrow: dialogue.topic ? `Вопрос · ${dialogue.topic}` : "Вопрос",
        description: truncate(dialogue.messages[0]?.content, "Диалог сохранен в вашей карте."),
        href: mainUrl(`/checkin?dialogueId=${dialogue.id}`),
        updatedAt: dialogue.updatedAt,
        status: dialogue.status,
        exportText: `Вопрос: ${dialogue.title}\nСтатус: ${dialogue.status}\n${dialogue.messages[0]?.content ?? ""}`,
        shareTopic: dialogue.topic ?? "dialogue",
      })),
    ...products
      .filter((product) => !isHiddenFromMap(product.metadata))
      .map((product) => ({
        kind: "product" as const,
        id: product.id,
        title: product.title,
        eyebrow: PRODUCT_LABELS[product.productKey] ?? "Результат",
        description: truncate(product.previewText ?? product.resultText, "Сохраненный результат готов к просмотру."),
        href: appUrl(`/cabinet/action-history?item=${product.id}`),
        updatedAt: product.updatedAt,
        status: product.status,
        exportText: `${PRODUCT_LABELS[product.productKey] ?? "Результат"}: ${product.title}\n${product.resultText ?? product.previewText ?? ""}`,
        shareTopic: product.productKey,
      })),
    ...routes
      .filter((route) => !isHiddenFromMap(route.metadata))
      .map((route) => ({
        kind: "route" as const,
        id: route.id,
        title: route.title,
        eyebrow: "Маршрут",
        description: `День ${route.currentDay}. Статус: ${route.status === "PAUSED" ? "пауза" : route.status.toLowerCase()}.`,
        href: mainUrl("/products/seven-days"),
        updatedAt: route.updatedAt,
        status: route.status,
        exportText: `Маршрут: ${route.title}\nДень: ${route.currentDay}\nСтатус: ${route.status}`,
        shareTopic: "seven-days",
      })),
  ];

  return items.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}
