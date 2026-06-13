// B386 (M26) — API чат-компаньона: получить состояние сеанса (GET) и отправить
// сообщение (POST). Auth обязателен, IP-рейт-лимит против абьюза.

import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { checkRequestAuthRateLimit } from "@/lib/auth-rate-limit";
import { requestContextFromHeaders } from "@/lib/request-context";
import {
  getOrCreateSession,
  getSessionState,
  sendCompanionMessage,
} from "@/lib/companion-chat-server";

// nullish: клиент может прислать null (нет dialogueId) — не считаем это ошибкой.
const postSchema = z.object({
  sessionId: z.string().min(1).nullish(),
  sourceDialogueId: z.string().min(1).max(64).nullish(),
  dialogueId: z.string().min(1).max(64).nullish(),
  message: z.string().min(1).max(2000),
  mode: z.enum(["stay", "explore", "question"]).nullish(),
});

export async function GET(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Не авторизован", 401, context);

  const sessionId = request.nextUrl.searchParams.get("sessionId");
  const dialogueId = request.nextUrl.searchParams.get("dialogueId");
  const state = await getSessionState({ userId, sessionId, sourceDialogueId: dialogueId });
  return jsonWithRequestContext({ state }, { status: 200 }, context);
}

export async function POST(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const limit = checkRequestAuthRateLimit(request, "companion-chat", 40, 5 * 60_000);
  if (!limit.allowed) {
    return jsonWithRequestContext(
      { error: "Слишком много сообщений, сделайте паузу", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
      context,
    );
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Не авторизован", 401, context);

  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorWithRequestContext("VALIDATION_ERROR", "Неверные данные", 400, context);

  const sessionId = parsed.data.sessionId
    ?? (await getOrCreateSession({ userId, sourceDialogueId: parsed.data.sourceDialogueId, mode: parsed.data.mode })).id;

  const result = await sendCompanionMessage({
    userId,
    sessionId,
    text: parsed.data.message,
    mode: parsed.data.mode,
    requestId: context.requestId,
  });

  if (result.kind === "not_found") {
    return errorWithRequestContext("NOT_FOUND", "Сеанс не найден", 404, context);
  }

  return jsonWithRequestContext({ result }, { status: 200 }, context);
}
