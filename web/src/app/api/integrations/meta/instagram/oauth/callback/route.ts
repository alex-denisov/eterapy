import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requestOrigin } from "@/lib/request-origin";
import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";
import {
  exchangeMetaAuthorizationCode,
  verifyMetaOAuthState,
} from "@/lib/marketing/meta-oauth";

export async function GET(request: Request) {
  // B688: адрес возврата берётся у прокси. `request.url` внутри контейнера —
  // это адрес привязки `0.0.0.0:3000`, и владелец получал мёртвую страницу
  // вместо админки, хотя подключение проходило.
  const origin = requestOrigin(request);
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN" || !session.user.id) {
    return NextResponse.redirect(new URL("/login?callbackUrl=/admin/marketing/agent", origin));
  }
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || !verifyMetaOAuthState(state, "Instagram", session.user.id)) {
    return NextResponse.redirect(new URL("/admin/marketing/agent?instagram=invalid_oauth", origin));
  }
  try {
    await exchangeMetaAuthorizationCode({ platform: "Instagram", code, actorId: session.user.id });
    await logAudit(session.user.id, AUDIT_ACTIONS.MARKETING_META_CONNECT, "instagram", "OAuth token encrypted and stored");
    return NextResponse.redirect(new URL("/admin/marketing/agent?instagram=connected", origin));
  } catch {
    return NextResponse.redirect(new URL("/admin/marketing/agent?instagram=oauth_failed", origin));
  }
}
