import { NextResponse } from "next/server";
import { resolveShortMarketingTarget } from "@/lib/marketing/link-presentation";
import { seoOrigins } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  props: { params: Promise<{ platform: string; target: string[] }> }
) {
  const { platform, target } = await props.params;
  const targetPath = Array.isArray(target) ? target.join("/") : "";
  const origin = new URL(request.url).origin || seoOrigins.main;

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
