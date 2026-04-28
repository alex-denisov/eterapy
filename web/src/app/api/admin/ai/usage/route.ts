import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { aiBudgetPeriod } from "@/lib/ai-gateway/domain";
import { getAIUsageLedger } from "@/lib/ai-gateway/usage";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { requestContextFromHeaders } from "@/lib/request-context";

const querySchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function GET(req: NextRequest) {
  const context = requestContextFromHeaders(req.headers);
  const session = await auth();
  const role = session?.user?.role ?? "";

  if (!session?.user?.id || !["ADMIN", "SUPERADMIN"].includes(role)) {
    return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);
  }

  const permissions = await getUserPermissions(session.user.id, role);
  if (!permissions.includes("analytics.view") && !permissions.includes("ai.configure")) {
    return errorWithRequestContext("FORBIDDEN", "Forbidden", 403, context);
  }

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams.entries()));
  if (!parsed.success) {
    return errorWithRequestContext("BAD_REQUEST", "Invalid period", 400, context);
  }

  const period = parsed.data.period ?? aiBudgetPeriod();
  const rows = await getAIUsageLedger(period);
  const totals = rows.reduce((acc, row) => ({
    tokens: acc.tokens + row.tokens,
    costMicros: acc.costMicros + row.costMicros,
    requestCount: acc.requestCount + row.requestCount,
  }), { tokens: 0, costMicros: 0, requestCount: 0 });

  return jsonWithRequestContext({
    period,
    rows,
    totals,
  }, { status: 200 }, context);
}
