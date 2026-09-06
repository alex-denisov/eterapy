import { NextResponse } from "next/server";
import { resolveShortMarketingTarget } from "@/lib/marketing/link-presentation";
import { requestOrigin } from "@/lib/request-origin";
import { seoOrigins } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  props: { params: Promise<{ platform: string; target: string[] }> }
) {
  const { platform, target } = await props.params;
  const targetPath = Array.isArray(target) ? target.join("/") : "";
  const rawOrigin = requestOrigin(request);
  const origin = !rawOrigin || /0\.0\.0\.0|localhost|127\.0\.0\.1/.test(rawOrigin)
    ? seoOrigins.main
    : rawOrigin;

  const destination = resolveShortMarketingTarget({
    platform,
    targetPath,
    origin,
  });

  if (!destination) {
    return NextResponse.redirect(new URL("/", origin), { status: 307 });
  }

  return NextResponse.redirect(destination, {
    status: 307,
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
