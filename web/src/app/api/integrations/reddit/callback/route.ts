import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";
import {
  exchangeRedditAuthorizationCode,
  verifyRedditOAuthState,
} from "@/lib/marketing/reddit-oauth";

export async function GET(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN" || !session.user.id) {
    return NextResponse.redirect(new URL("/login?callbackUrl=/admin/marketing/agent", request.url));
  }
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || !verifyRedditOAuthState(state, session.user.id)) {
    return NextResponse.redirect(new URL("/admin/marketing/agent?reddit=invalid_oauth", request.url));
  }
  try {
    await exchangeRedditAuthorizationCode(code);
    await logAudit(
      session.user.id,
      AUDIT_ACTIONS.MARKETING_REDDIT_CONNECT,
      "reddit",
      "OAuth refresh token encrypted and stored",
    );
    return NextResponse.redirect(new URL("/admin/marketing/agent?reddit=connected", request.url));
  } catch {
    return NextResponse.redirect(new URL("/admin/marketing/agent?reddit=oauth_failed", request.url));
  }
}
