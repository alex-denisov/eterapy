import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { checkRequestAuthRateLimit, authRateLimitResponse } from "@/lib/auth-rate-limit";
import {
  linkTelegramIdentity,
  TelegramLaunchError,
  telegramMiniAppSsoEnabled,
  verifyTelegramInitData,
} from "@/lib/miniapp/telegram/auth";
import { getRequestMeta } from "@/lib/request-meta";
import { isSameOriginMiniAppRequest, readMiniAppInitData } from "@/lib/miniapp/telegram/request";

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  return response;
}

export async function POST(request: NextRequest) {
  if (!telegramMiniAppSsoEnabled()) return noStore(NextResponse.json({ error: "Telegram SSO отключён" }, { status: 404 }));
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "CLIENT") return noStore(NextResponse.json({ error: "Нужно войти в аккаунт" }, { status: 401 }));
  const limit = checkRequestAuthRateLimit(request, "miniapp:telegram:link", 8, 15 * 60_000);
  if (!limit.allowed) return noStore(authRateLimitResponse(limit));
  if (!isSameOriginMiniAppRequest(request)) return noStore(NextResponse.json({ error: "Недопустимый источник запроса" }, { status: 403 }));

  const body = await readMiniAppInitData(request);
  if (!body.ok) return noStore(NextResponse.json({ error: body.error }, { status: body.status }));

  try {
    const launch = verifyTelegramInitData(body.initData);
    const result = await linkTelegramIdentity(session.user.id, launch);
    if (!result.ok) {
      const message = result.code === "IDENTITY_IN_USE"
        ? "Этот Telegram уже связан с другим аккаунтом"
        : "К аккаунту уже привязан другой Telegram";
      return noStore(NextResponse.json({ error: message, code: result.code }, { status: 409 }));
    }
    const meta = await getRequestMeta();
    await logAudit(session.user.id, "UPDATE_PROFILE", undefined, JSON.stringify({ action: "link_platform_identity", provider: "telegram", channel: "miniapp" }), meta.ip ?? undefined);
    return noStore(NextResponse.json({ ok: true }));
  } catch (error) {
    if (error instanceof TelegramLaunchError) return noStore(NextResponse.json({ error: error.message, code: error.code }, { status: 401 }));
    return noStore(NextResponse.json({ error: "Не удалось связать Telegram с аккаунтом" }, { status: 500 }));
  }
}
