import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { requestContextFromHeaders } from "@/lib/request-context";
import {
  isSupportSessionStale,
  supportSessionPreview,
  type SupportSessionSummary,
} from "@/lib/support-sessions";

// B464 round-5 #13 · GET /api/support/conversations — список сессий поддержки
// текущего пользователя для выбора «посмотреть / продолжить».
//
// Лениво закрывает открытые сессии без активности > 30 минут (таймаут
// неактивности по спецификации владельца). Для нового staff-ответа закрытую
// сессию оператор поддержки сначала явно переоткрывает.

const LIST_LIMIT = 20;

export async function GET(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);

  const now = new Date();
  const conversations = await db.supportConversation.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
    select: {
      id: true,
      status: true,
      subject: true,
      createdAt: true,
      _count: { select: { messages: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  });

  // Первое клиентское сообщение каждой сессии — превью в списке.
  const firstUserMessages = await db.supportMessage.findMany({
    where: { conversationId: { in: conversations.map((c) => c.id) }, role: "USER" },
    orderBy: { createdAt: "asc" },
    select: { conversationId: true, content: true },
    distinct: ["conversationId"],
  });
  const previewByConversation = new Map(firstUserMessages.map((m) => [m.conversationId, m.content]));

  const staleOpenIds = conversations
    .filter((c) => c.status === "OPEN" && isSupportSessionStale(c.messages[0]?.createdAt ?? c.createdAt, now))
    .map((c) => c.id);
  if (staleOpenIds.length > 0) {
    await db.supportConversation.updateMany({
      where: { id: { in: staleOpenIds }, status: "OPEN" },
      data: { status: "CLOSED", closedAt: now },
    });
  }

  const latestId = conversations[0]?.id ?? null;
  const sessions: SupportSessionSummary[] = conversations.map((c) => ({
    id: c.id,
    status: staleOpenIds.includes(c.id) ? "CLOSED" : (c.status as "OPEN" | "CLOSED"),
    createdAt: c.createdAt.toISOString(),
    lastActivityAt: (c.messages[0]?.createdAt ?? c.createdAt).toISOString(),
    preview: supportSessionPreview(previewByConversation.get(c.id), c.subject),
    messageCount: c._count.messages,
    // Продолжить можно только ПОСЛЕДНЮЮ сессию (owner round-5 #13).
    canContinue: c.id === latestId,
  }));

  return jsonWithRequestContext({ sessions }, { status: 200 }, context);
}
