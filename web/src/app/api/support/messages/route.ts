import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { requestContextFromHeaders } from "@/lib/request-context";
import { log, serializeError } from "@/lib/logger";
import { sendTelegram } from "@/lib/telegram";
import { checkRequestAuthRateLimit } from "@/lib/auth-rate-limit";

// B333 · Cabinet ↔ Telegram support chat.
//
// GET  /api/support/messages?since=ISO  → last N messages for the current
//                                          user's open conversation.
// POST /api/support/messages            → append a USER message, lazily
//                                          open a conversation, forward to
//                                          the Telegram support group.
//
// Staff replies arrive through /api/telegram/webhook (separate handler)
// which writes role=STAFF messages into the same conversation; this poll
// endpoint surfaces them on the next 3s tick.

const SUPPORT_GROUP_CHAT_ID =
  process.env.TELEGRAM_SUPPORT_CHAT_ID ?? process.env.SUPPORT_TELEGRAM_CHAT_ID ?? null;
const MESSAGE_MAX = 2000;
const RETURN_LIMIT = 100;

const postSchema = z.object({
  content: z.string().trim().min(1).max(MESSAGE_MAX),
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

async function ensureOpenConversation(userId: string) {
  const open = await db.supportConversation.findFirst({
    where: { userId, status: "OPEN" },
    orderBy: { createdAt: "desc" },
  });
  if (open) return open;
  return db.supportConversation.create({ data: { userId, status: "OPEN" } });
}

export async function GET(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);

  const conversation = await db.supportConversation.findFirst({
    where: { userId, status: "OPEN" },
    orderBy: { createdAt: "desc" },
  });

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

  const conversation = await ensureOpenConversation(userId);
  const message = await db.supportMessage.create({
    data: {
      conversationId: conversation.id,
      role: "USER",
      content: parsed.data.content,
    },
    select: { id: true, role: true, content: true, createdAt: true },
  });

  // Forward to the Telegram support group. Best-effort: a failure here
  // does NOT undo the saved message — the staff will see it later via
  // an admin panel or, eventually, via a sweeper job.
  if (SUPPORT_GROUP_CHAT_ID) {
    const userLabel = session.user?.name ?? session.user?.email ?? `user:${userId.slice(0, 8)}`;
    const text =
      `<b>ETerapy support</b>\n` +
      `от: ${userLabel} (${userId})\n` +
      `conversation: ${conversation.id}\n\n` +
      parsed.data.content;
    try {
      await sendTelegram(SUPPORT_GROUP_CHAT_ID, text);
    } catch (error) {
      log.warn("support.forward_to_telegram_failed", {
        requestId: context.requestId,
        conversationId: conversation.id,
        error: serializeError(error),
      });
    }
  } else {
    log.warn("support.telegram_group_not_configured", { conversationId: conversation.id });
  }

  return jsonWithRequestContext(
    { conversationId: conversation.id, message: serializeMessage(message) },
    { status: 200 },
    context,
  );
}
