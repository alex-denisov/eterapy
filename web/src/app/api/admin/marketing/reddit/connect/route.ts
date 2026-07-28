import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  createRedditOAuthState,
  redditAuthorizationUrl,
} from "@/lib/marketing/reddit-oauth";

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN" || !session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const state = createRedditOAuthState(session.user.id);
  return NextResponse.redirect(await redditAuthorizationUrl({ state }));
}
