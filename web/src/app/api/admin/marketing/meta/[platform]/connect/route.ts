import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  createMetaOAuthState,
  metaAuthorizationUrl,
  type MetaMarketingPlatform,
} from "@/lib/marketing/meta-oauth";

function platformFromParam(value: string): MetaMarketingPlatform | null {
  if (value.toLowerCase() === "threads") return "Threads";
  if (value.toLowerCase() === "instagram") return "Instagram";
  return null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ platform: string }> },
) {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN" || !session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const platform = platformFromParam((await params).platform);
  if (!platform) return NextResponse.json({ error: "Unknown platform" }, { status: 404 });
  const state = createMetaOAuthState(platform, session.user.id);
  try {
    return NextResponse.redirect(await metaAuthorizationUrl({ platform, state }));
  } catch {
    return NextResponse.redirect(new URL("/admin/marketing/agent?meta=missing_app_settings", "https://admin.eterapy.com"));
  }
}
