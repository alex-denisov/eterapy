import { AIProvider } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import {
  getAIControlCenterData,
  updateAIProviderConfig,
  updateAIRoutingPolicy,
} from "@/lib/ai-gateway/admin-config";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { requestContextFromHeaders } from "@/lib/request-context";

const providerSchema = z.object({
  type: z.literal("provider"),
  provider: z.nativeEnum(AIProvider),
  enabled: z.boolean(),
  priority: z.coerce.number().int().min(1).max(1000),
  baseUrl: z.string().trim().url().optional().or(z.literal("")),
  defaultModel: z.string().trim().optional().or(z.literal("")),
  timeoutMs: z.coerce.number().int().min(1000).max(120_000),
  inputTokenCostMicros: z.coerce.number().int().min(0).optional().nullable(),
  outputTokenCostMicros: z.coerce.number().int().min(0).optional().nullable(),
  cloudflareGatewayEnabled: z.boolean().optional(),
});

const policySchema = z.object({
  type: z.literal("policy"),
  feature: z.string().trim().min(2).max(96),
  enabled: z.boolean(),
  providerOrder: z.array(z.nativeEnum(AIProvider)).min(1),
  modelPreferences: z.record(z.string(), z.string()).optional().nullable(),
  maxTokens: z.coerce.number().int().min(1).max(200_000).optional().nullable(),
  temperature: z.coerce.number().min(0).max(2).optional().nullable(),
  timeoutMs: z.coerce.number().int().min(1000).max(120_000).optional().nullable(),
  dailyTokenBudget: z.coerce.number().int().min(1).optional().nullable(),
  perUserDailyTokenBudget: z.coerce.number().int().min(1).optional().nullable(),
});

const mutationSchema = z.discriminatedUnion("type", [providerSchema, policySchema]);

async function requireAIConfigure(req: NextRequest) {
  const context = requestContextFromHeaders(req.headers);
  const session = await auth();
  const role = session?.user?.role ?? "";

  if (!session?.user?.id || !["ADMIN", "SUPERADMIN"].includes(role)) {
    return { context, error: errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context) };
  }

  const permissions = await getUserPermissions(session.user.id, role);
  if (!permissions.includes("ai.configure")) {
    return { context, error: errorWithRequestContext("FORBIDDEN", "Forbidden", 403, context) };
  }

  return { context, session, role };
}

export async function GET(req: NextRequest) {
  const access = await requireAIConfigure(req);
  if ("error" in access) return access.error;

  const data = await getAIControlCenterData(undefined, { includeSecrets: access.role === "SUPERADMIN" });
  return jsonWithRequestContext(data, { status: 200 }, access.context);
}

export async function PATCH(req: NextRequest) {
  const access = await requireAIConfigure(req);
  if ("error" in access) return access.error;

  const parsed = mutationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return errorWithRequestContext("BAD_REQUEST", "Invalid AI control payload", 400, access.context);
  }

  const result = parsed.data.type === "provider"
    ? await updateAIProviderConfig(access.session.user.id, parsed.data)
    : await updateAIRoutingPolicy(access.session.user.id, parsed.data);

  return jsonWithRequestContext({ ok: true, result }, { status: 200 }, access.context);
}
