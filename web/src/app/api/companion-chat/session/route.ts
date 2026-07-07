// B386 (M26) — старт/продление платного чат-сеанса. Списание баллов идёт
// транзакционно в clarity-credit-ledger; Premium-квота (2/мес) — без списания.

import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { checkRequestAuthRateLimit } from "@/lib/auth-rate-limit";
import { requestContextFromHeaders } from "@/lib/request-context";
import { extendPaidSession, startPaidSession } from "@/lib/companion-chat-server";

// B445: sessionId опционален — при «Начать диалог» на свежем экране сессии ещё нет
// в БД, сервер создаёт её под нужный источник прямо на старте.
const postSchema = z.object({
  sessionId: z.string().min(1).nullish(),
  action: z.enum(["start", "extend"]),
  sourceDialogueId: z.string().min(1).max(64).nullish(),
  sourceAnalysisId: z.string().min(1).max(64).nullish(),
});

export async function POST(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const limit = checkRequestAuthRateLimit(request, "companion-chat-session", 12, 5 * 60_000);
  if (!limit.allowed) {
    return jsonWithRequestContext(
      { error: "Слишком много запросов", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
      context,
    );
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Не авторизован", 401, context);

  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorWithRequestContext("VALIDATION_ERROR", "Неверные данные", 400, context);

  if (parsed.data.action === "extend" && !parsed.data.sessionId) {
    return errorWithRequestContext("NO_ACTIVE_SESSION", "Сначала откройте сеанс, затем его можно продлить.", 409, context);
  }

  const result = parsed.data.action === "start"
    ? await startPaidSession({
        userId,
        sessionId: parsed.data.sessionId,
        sourceDialogueId: parsed.data.sourceDialogueId,
        sourceAnalysisId: parsed.data.sourceAnalysisId,
      })
    : await extendPaidSession({ userId, sessionId: parsed.data.sessionId! });

  if (!result.ok) {
    if (result.reason === "not_found") return errorWithRequestContext("NOT_FOUND", "Сеанс не найден", 404, context);
    if (result.reason === "needs_active_session") {
      return errorWithRequestContext("NO_ACTIVE_SESSION", "Сначала откройте сеанс, затем его можно продлить.", 409, context);
    }
    return jsonWithRequestContext(
      { ok: false, error: "Недостаточно баллов. Пополните кошелёк, чтобы продолжить разговор.", code: "INSUFFICIENT_CREDITS" },
      { status: 402, headers: {} },
      context,
    );
  }

  return jsonWithRequestContext({ ok: true, includedByPremium: result.includedByPremium, state: result.state }, { status: 200 }, context);
}
