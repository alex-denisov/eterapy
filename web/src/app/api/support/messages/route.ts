import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { requestContextFromHeaders } from "@/lib/request-context";
import { log, serializeError } from "@/lib/logger";
import { sendTelegramSupport } from "@/lib/telegram";
import { absoluteAdminUrl } from "@/lib/subdomain";
import { checkRequestAuthRateLimit } from "@/lib/auth-rate-limit";
import { canReuseSupportSession, isSupportSessionStale } from "@/lib/support-sessions";

// B482 · Cabinet ↔ first-party support chat.
//
// GET  /api/support/messages?since=ISO  → last N messages for the current
//                                          user's open conversation.
// POST /api/support/messages            → append a USER message, lazily open a
//                                          conversation, and emit a content-free
//                                          availability alert to Telegram.
// Staff replies are created only by an authenticated operator with support.manage.

const SUPPORT_ALERT_CHAT_ID = process.env.TELEGRAM_SUPPORT_ALERT_CHAT_ID ?? null;
const MESSAGE_MAX = 2000;
const RETURN_LIMIT = 100;

const postSchema = z.object({
  content: z.string().trim().min(1).max(MESSAGE_MAX),
  // B464 round-5 #13 — сессии: продолжить конкретную (только последнюю) или
  // явно начать новую. Без обоих полей действует legacy-поведение: свежая
  // открытая сессия переиспользуется, устаревшая закрывается и создаётся новая.
  conversationId: z.string().trim().min(1).optional(),
  newSession: z.boolean().optional(),
});

type SerializedMessage = {
  id: string;
  role: string;
  content: string;
  createdAt: string;
};

function serializeMessage(message: {
  id: string;
  role: string;
  content: string;
  createdAt: Date;
}): SerializedMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
  };
}

async function lastActivityAt(conversation: { id: string; createdAt: Date }): Promise<Date> {
  const last = await db.supportMessage.findFirst({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return last?.createdAt ?? conversation.createdAt;
}

// B464 round-5 #13: сессии поддержки.
//   conversationId → продолжить конкретную сессию (разрешено только для
//     ПОСЛЕДНЕЙ; закрытая по таймауту переоткрывается);
//   newSession → всегда новая сессия;
//   иначе legacy: свежая (< 30 мин активности) открытая сессия
//     переиспользуется, устаревшая лениво закрывается и создаётся новая.
type ConversationResolution =
  | { ok: true; conversation: { id: string; status: string; createdAt: Date } }
  | { ok: false; status: number; code: string; message: string };

async function resolveConversation(
  userId: string,
  input: { conversationId?: string; newSession?: boolean },
): Promise<ConversationResolution> {
  const now = new Date();

  if (input.conversationId) {
    const conversation = await db.supportConversation.findFirst({
      where: { id: input.conversationId, userId },
    });
    if (!conversation) {
      return { ok: false, status: 404, code: "NOT_FOUND", message: "Сессия не найдена" };
    }
    const latest = await db.supportConversation.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (latest && latest.id !== conversation.id) {
      return {
        ok: false,
        status: 409,
        code: "NOT_LATEST_SESSION",
        message: "Продолжить можно только последнюю сессию — начните новую",
      };
    }
    if (conversation.status !== "OPEN") {
      const reopened = await db.supportConversation.update({
        where: { id: conversation.id },
        data: { status: "OPEN", closedAt: null },
      });
      return { ok: true, conversation: reopened };
    }
    return { ok: true, conversation };
  }

  const open = await db.supportConversation.findFirst({
    where: { userId, status: "OPEN" },
    orderBy: { createdAt: "desc" },
  });

  if (open) {
    const activity = await lastActivityAt(open);
    if (!input.newSession && canReuseSupportSession(open.status, activity, now)) {
      return { ok: true, conversation: open };
    }
    // Явный запрос новой сессии ИЛИ таймаут 30 минут: старую закрываем.
    if (input.newSession || isSupportSessionStale(activity, now)) {
      await db.supportConversation.update({
        where: { id: open.id },
        data: { status: "CLOSED", closedAt: now },
      });
    } else {
      // Свежая открытая сессия без явного newSession — переиспользуем.
      return { ok: true, conversation: open };
    }
  }

  const created = await db.supportConversation.create({ data: { userId, status: "OPEN" } });
  return { ok: true, conversation: created };
}

export async function GET(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);

  // Round-5 #13: ?conversationId= читает конкретную сессию (включая закрытые —
  // история доступна на просмотр). Без параметра — legacy: последняя открытая.
  const conversationIdParam = request.nextUrl.searchParams.get("conversationId");
  const conversation = conversationIdParam
    ? await db.supportConversation.findFirst({
        where: { id: conversationIdParam, userId },
      })
    : await db.supportConversation.findFirst({
        where: { userId, status: "OPEN" },
        orderBy: { createdAt: "desc" },
      });

  if (conversationIdParam && !conversation) {
    return errorWithRequestContext("NOT_FOUND", "Сессия не найдена", 404, context);
  }

  if (!conversation) {
    return jsonWithRequestContext(
      { conversationId: null, messages: [] as SerializedMessage[] },
      { status: 200 },
      context,
    );
  }

  const sinceParam = request.nextUrl.searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : null;

  const messages = await db.supportMessage.findMany({
    where: {
      conversationId: conversation.id,
      ...(since && !Number.isNaN(since.getTime()) ? { createdAt: { gt: since } } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: RETURN_LIMIT,
    select: { id: true, role: true, content: true, createdAt: true },
  });

  return jsonWithRequestContext(
    { conversationId: conversation.id, messages: messages.map(serializeMessage) },
    { status: 200 },
    context,
  );
}

export async function POST(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  // Light per-user rate limit — staff hates spam pings just as much as the
  // user does. 20 messages / 5 min is plenty for a real support thread.
  const limit = checkRequestAuthRateLimit(request, "support:message", 20, 5 * 60_000);
  if (!limit.allowed) {
    return jsonWithRequestContext(
      { error: "Слишком много сообщений подряд — подождите минуту", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
      context,
    );
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);

  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorWithRequestContext("VALIDATION_ERROR", "Empty or oversized message", 400, context);
  }

  const resolution = await resolveConversation(userId, {
    conversationId: parsed.data.conversationId,
    newSession: parsed.data.newSession,
  });
  if (!resolution.ok) {
    return jsonWithRequestContext(
      { error: resolution.message, code: resolution.code },
      { status: resolution.status },
      context,
    );
  }
  const conversation = resolution.conversation;
  const message = await db.supportMessage.create({
    data: {
      conversationId: conversation.id,
      role: "USER",
      content: parsed.data.content,
    },
    select: { id: true, role: true, content: true, createdAt: true },
  });

  // Telegram is an owner-only pager, not a support data channel. The alert is
  // deliberately identical for every client and contains no content, identity,
  // conversation id, attachments or routing metadata. Best-effort delivery can
  // never undo the canonical message already stored above.
  if (SUPPORT_ALERT_CHAT_ID) {
    try {
      await sendTelegramSupport(
        SUPPORT_ALERT_CHAT_ID,
        `<b>Новое сообщение в поддержке ETerapy</b>\nОткройте консоль: ${absoluteAdminUrl("/admin/support")}`,
      );
    } catch (error) {
      log.warn("support.telegram_alert_failed", {
        requestId: context.requestId,
        conversationId: conversation.id,
        error: serializeError(error),
      });
    }
  } else {
    log.warn("support.telegram_alert_not_configured", { conversationId: conversation.id });
  }

  return jsonWithRequestContext(
    { conversationId: conversation.id, message: serializeMessage(message) },
    { status: 200 },
    context,
  );
}
