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
import {
  MINIAPP_LAUNCH_COOKIE,
  readLaunchSessionCookieValue,
} from "@/lib/miniapp/telegram/launch-session";
import { isSameOriginMiniAppRequest, readMiniAppInitData } from "@/lib/miniapp/telegram/request";
import type { VerifiedTelegramLaunch } from "@/lib/miniapp/telegram/auth";

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

  // B554 п.6: сначала — launch-сессия, выданная на bootstrap после проверки
  // подписи. Telegram не обновляет `initData`, пока Mini App открыт, поэтому к
  // моменту «связать аккаунт» (после разбора, то есть заведомо позже пяти
  // минут) он всегда просрочен, и клиент упирался в «сессия устарела».
  // `initData` остаётся запасным путём: для запуска, где куку не приняли.
  const launchSession = readLaunchSessionCookieValue(request.cookies.get(MINIAPP_LAUNCH_COOKIE)?.value);

  let launch: VerifiedTelegramLaunch;
  if (launchSession) {
    launch = {
      provider: "telegram",
      subjectId: launchSession.subjectId,
      username: launchSession.username,
      firstName: launchSession.firstName,
      lastName: launchSession.lastName,
      // Эти два поля нужны только проверке подписи запуска, которая уже
      // пройдена; связывание их не использует.
      authDate: new Date(),
      launchHash: "",
    };
  } else {
    const body = await readMiniAppInitData(request);
    if (!body.ok) return noStore(NextResponse.json({ error: body.error }, { status: body.status }));
    try {
      launch = verifyTelegramInitData(body.initData);
    } catch (error) {
      if (error instanceof TelegramLaunchError) {
        return noStore(NextResponse.json({ error: error.message, code: error.code }, { status: 401 }));
      }
      return noStore(NextResponse.json({ error: "Не удалось связать Telegram с аккаунтом" }, { status: 500 }));
    }
  }

  try {
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
