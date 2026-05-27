import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { readRuntimeLogSnapshot } from "@/lib/admin-runtime-logs";
import { requestContextFromHeaders } from "@/lib/request-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseLimit(value: string | null) {
  const parsed = Number(value ?? "200");
  if (!Number.isFinite(parsed) || parsed < 1) return 200;
  return Math.min(Math.floor(parsed), 500);
}

export async function GET(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") {
    return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);
  }
  const url = request.nextUrl ?? new URL(request.url);

  const snapshot = await readRuntimeLogSnapshot({
    limit: parseLimit(url.searchParams.get("limit")),
    source: url.searchParams.get("source") ?? "all",
    level: url.searchParams.get("level") ?? "all",
    search: url.searchParams.get("q") ?? "",
  });

  return jsonWithRequestContext(snapshot, { status: 200 }, context);
}
