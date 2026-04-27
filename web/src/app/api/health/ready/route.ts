import { NextRequest } from "next/server";
import { jsonWithRequestContext } from "@/lib/api-response";
import { getReadinessHealth } from "@/lib/health";
import { requestContextFromHeaders } from "@/lib/request-context";

export async function GET(req: NextRequest) {
  const context = requestContextFromHeaders(req.headers);
  const health = await getReadinessHealth(context);
  return jsonWithRequestContext(health, { status: health.status === "ok" ? 200 : 503 }, context);
}
