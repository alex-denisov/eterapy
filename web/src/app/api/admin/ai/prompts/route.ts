import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import {
  listAIPromptConfigs,
  resetAIPromptConfig,
  updateAIPromptConfig,
} from "@/lib/ai-gateway/prompts";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { requestContextFromHeaders } from "@/lib/request-context";

const updateSchema = z.object({
  feature: z.string().trim().min(2).max(96),
  title: z.string().trim().min(1).max(160).optional(),
  productKey: z.string().trim().max(120).optional().nullable(),
  promptText: z.string().trim().min(1).max(30_000),
  enabled: z.boolean().optional(),
});

async function requireSuperadminAIConfigure(req: NextRequest) {
  const context = requestContextFromHeaders(req.headers);
  const session = await auth();
  const role = session?.user?.role ?? "";

  if (!session?.user?.id || role !== "SUPERADMIN") {
    return { context, error: errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context) };
  }

  const permissions = await getUserPermissions(session.user.id, role);
  if (!permissions.includes("ai.configure")) {
    return { context, error: errorWithRequestContext("FORBIDDEN", "Forbidden", 403, context) };
  }

  return { context, session };
}

export async function GET(req: NextRequest) {
  const access = await requireSuperadminAIConfigure(req);
  if ("error" in access) return access.error;

  const prompts = await listAIPromptConfigs();
  return jsonWithRequestContext({ prompts }, { status: 200 }, access.context);
}

export async function PATCH(req: NextRequest) {
  const access = await requireSuperadminAIConfigure(req);
  if ("error" in access) return access.error;

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return errorWithRequestContext("BAD_REQUEST", "Invalid AI prompt payload", 400, access.context);
  }

  try {
    const prompt = await updateAIPromptConfig(access.session.user.id, {
      feature: parsed.data.feature,
      title: parsed.data.title,
      productKey: parsed.data.productKey ?? null,
      promptText: parsed.data.promptText,
      enabled: parsed.data.enabled,
    });
    return jsonWithRequestContext({ prompt }, { status: 200 }, access.context);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Prompt update failed";
    return errorWithRequestContext("BAD_REQUEST", message, 400, access.context);
  }
}

export async function DELETE(req: NextRequest) {
  const access = await requireSuperadminAIConfigure(req);
  if ("error" in access) return access.error;

  const feature = new URL(req.url).searchParams.get("feature") ?? "";
  if (!feature.trim()) {
    return errorWithRequestContext("BAD_REQUEST", "feature query param is required", 400, access.context);
  }

  try {
    const prompt = await resetAIPromptConfig(access.session.user.id, feature);
    return jsonWithRequestContext({ prompt }, { status: 200 }, access.context);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Prompt reset failed";
    return errorWithRequestContext("BAD_REQUEST", message, 400, access.context);
  }
}
