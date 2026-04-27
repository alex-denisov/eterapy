import { NextRequest } from "next/server";
import { jsonWithRequestContext } from "@/lib/api-response";
import { getLiveHealth, getReadinessHealth } from "@/lib/health";
import { requestContextFromHeaders } from "@/lib/request-context";

export async function GET(req: NextRequest) {
  const context = requestContextFromHeaders(req.headers);
  const [live, ready] = await Promise.all([
    Promise.resolve(getLiveHealth()),
    getReadinessHealth(context),
  ]);

  return jsonWithRequestContext(
    {
      status: live.status,
      live,
      ready,
      db: ready.checks.find((check) => check.name === "database")?.status ?? "unknown",
    },
    { status: 200 },
    context
  );
}
