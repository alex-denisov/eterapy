import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { requestContextFromHeaders } from "@/lib/request-context";
import {
  deleteCredential,
  updateCredential,
} from "@/lib/ai-gateway/credentials";

const updateSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  apiKey: z.string().trim().min(8).max(2048).optional(),
  enabled: z.boolean().optional(),
  priority: z.coerce.number().int().min(0).max(1_000_000).optional(),
  baseUrlOverride: z.string().trim().url().optional().or(z.literal("")).nullable(),
  modelOverride: z.string().trim().min(1).max(160).optional().or(z.literal("")).nullable(),
  resetFailureState: z.boolean().optional(),
});

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

  return { context, session };
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const access = await requireAIConfigure(req);
  if ("error" in access) return access.error;

  const { id } = await ctx.params;
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return errorWithRequestContext("BAD_REQUEST", "Invalid AI credential payload", 400, access.context);
  }

  try {
    const credential = await updateCredential(access.session.user.id, id, {
      label: parsed.data.label,
      apiKey: parsed.data.apiKey,
      enabled: parsed.data.enabled,
      priority: parsed.data.priority,
      baseUrlOverride: parsed.data.baseUrlOverride === undefined ? undefined : (parsed.data.baseUrlOverride || null),
      modelOverride: parsed.data.modelOverride === undefined ? undefined : (parsed.data.modelOverride || null),
      resetFailureState: parsed.data.resetFailureState,
    });
    return jsonWithRequestContext({ credential }, { status: 200 }, access.context);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Credential update failed";
    return errorWithRequestContext("BAD_REQUEST", message, 400, access.context);
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const access = await requireAIConfigure(req);
  if ("error" in access) return access.error;

  const { id } = await ctx.params;
  try {
    await deleteCredential(access.session.user.id, id);
    return jsonWithRequestContext({ ok: true }, { status: 200 }, access.context);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Credential delete failed";
    return errorWithRequestContext("BAD_REQUEST", message, 400, access.context);
  }
}
