import { NextRequest } from "next/server";
import { AIProvider, AIRequestStatus } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { listAIRoutingAuditLogs } from "@/lib/ai-gateway/routing-audit";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { requestContextFromHeaders } from "@/lib/request-context";

const booleanParam = z.preprocess((value) => {
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}, z.boolean());

const querySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  feature: z.string().trim().max(96).optional(),
  provider: z.nativeEnum(AIProvider).optional(),
  status: z.nativeEnum(AIRequestStatus).optional(),
  foreign_llm_used: booleanParam.optional(),
  cloudflare_ai_gateway_used: booleanParam.optional(),
  cross_border_processing: booleanParam.optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
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
    return errorWithRequestContext("BAD_REQUEST", "Invalid AI routing audit query", 400, context);
  }

  const audit = await listAIRoutingAuditLogs({
    from: parsed.data.from ? new Date(parsed.data.from) : undefined,
    to: parsed.data.to ? new Date(parsed.data.to) : undefined,
    feature: parsed.data.feature,
    provider: parsed.data.provider,
    status: parsed.data.status,
    foreignLLMUsed: parsed.data.foreign_llm_used,
    cloudflareAIGatewayUsed: parsed.data.cloudflare_ai_gateway_used,
    crossBorderProcessing: parsed.data.cross_border_processing,
    limit: parsed.data.limit,
  });

  return jsonWithRequestContext(audit, { status: 200 }, context);
}
