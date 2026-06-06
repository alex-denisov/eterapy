import { NextRequest, NextResponse } from "next/server";
import { recordPractitionerInviteVisit, setByocCookie } from "@/lib/byoc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug") ?? "";
  const token = req.nextUrl.searchParams.get("ref");
  if (!slug || !token) return NextResponse.json({ ok: false, status: "missing" }, { status: 400 });

  const result = await recordPractitionerInviteVisit({ request: req, slug, token });
  const response = NextResponse.json({ ok: result.status === "recorded", status: result.status });
  if (result.status === "recorded") setByocCookie(response, token);
  return response;
}
