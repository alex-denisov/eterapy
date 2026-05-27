import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { aiBudgetPeriod } from "@/lib/ai-gateway/domain";
import { listAdminAIInteractions } from "@/lib/ai-gateway/interactions";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { requestContextFromHeaders } from "@/lib/request-context";

const querySchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  feature: z.string().trim().max(96).optional(),
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export async function GET(req: NextRequest) {
  const context = requestContextFromHeaders(req.headers);
  const session = await auth();
  const role = session?.user?.role ?? "";

  if (!session?.user?.id || role !== "SUPERADMIN") {
    return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);
  }

  const permissions = await getUserPermissions(session.user.id, role);
  if (!permissions.includes("ai.configure") && !permissions.includes("dialogues.view")) {
    return errorWithRequestContext("FORBIDDEN", "Forbidden", 403, context);
  }

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams.entries()));
  if (!parsed.success) {
    return errorWithRequestContext("BAD_REQUEST", "Invalid AI interactions query", 400, context);
  }

  const interactions = await listAdminAIInteractions({
    period: parsed.data.period ?? aiBudgetPeriod(),
    feature: parsed.data.feature,
    q: parsed.data.q,
    limit: parsed.data.limit ?? 50,
  });
  return jsonWithRequestContext({ interactions }, { status: 200 }, context);
}
