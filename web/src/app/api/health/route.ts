import { NextRequest } from "next/server";
import db from "@/lib/db";
import { jsonWithRequestContext } from "@/lib/api-response";
import { log, serializeError } from "@/lib/logger";
import { requestContextFromHeaders } from "@/lib/request-context";

export async function GET(req: NextRequest) {
  const context = requestContextFromHeaders(req.headers);
  let dbStatus = "unknown";
  let userCount = 0;

  try {
    userCount = await db.user.count();
    dbStatus = "ok";
  } catch (err) {
    dbStatus = `error: ${err instanceof Error ? err.message : String(err)}`;
    log.error("health-db-check-failed", {
      requestId: context.requestId,
      error: serializeError(err),
    });
  }

  return jsonWithRequestContext(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "0.0.1",
      db: dbStatus,
      users: userCount,
    },
    { status: 200 },
    context
  );
}
