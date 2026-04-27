import { NextRequest } from "next/server";
import { jsonWithRequestContext } from "@/lib/api-response";
import { getLiveHealth } from "@/lib/health";
import { requestContextFromHeaders } from "@/lib/request-context";

export async function GET(req: NextRequest) {
  const context = requestContextFromHeaders(req.headers);
  return jsonWithRequestContext(getLiveHealth(), { status: 200 }, context);
}
