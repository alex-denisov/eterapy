import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";
import {
  exchangeMetaAuthorizationCode,
  verifyMetaOAuthState,
} from "@/lib/marketing/meta-oauth";

export async function GET(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN" || !session.user.id) {
    return NextResponse.redirect(new URL("/login?callbackUrl=/admin/marketing/agent", request.url));
  }
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || !verifyMetaOAuthState(state, "Instagram", session.user.id)) {
    return NextResponse.redirect(new URL("/admin/marketing/agent?instagram=invalid_oauth", request.url));
  }
  try {
    await exchangeMetaAuthorizationCode({ platform: "Instagram", code, actorId: session.user.id });
    await logAudit(session.user.id, AUDIT_ACTIONS.MARKETING_META_CONNECT, "instagram", "OAuth token encrypted and stored");
    return NextResponse.redirect(new URL("/admin/marketing/agent?instagram=connected", request.url));
  } catch {
    return NextResponse.redirect(new URL("/admin/marketing/agent?instagram=oauth_failed", request.url));
  }
}
