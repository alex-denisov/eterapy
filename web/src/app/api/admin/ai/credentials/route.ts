import { AIProvider } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { requestContextFromHeaders } from "@/lib/request-context";
import {
  createCredential,
  listCredentials,
} from "@/lib/ai-gateway/credentials";

const createSchema = z.object({
  provider: z.nativeEnum(AIProvider),
  label: z.string().trim().min(1).max(80),
  apiKey: z.string().trim().min(8).max(2048),
  enabled: z.boolean().optional(),
  priority: z.coerce.number().int().min(0).max(1_000_000).optional(),
  baseUrlOverride: z.string().trim().url().optional().or(z.literal("")).nullable(),
  modelOverride: z.string().trim().min(1).max(160).optional().or(z.literal("")).nullable(),
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

export async function GET(req: NextRequest) {
  const access = await requireAIConfigure(req);
  if ("error" in access) return access.error;

  const url = new URL(req.url);
  const providerParam = url.searchParams.get("provider");
  const provider = providerParam && (Object.values(AIProvider) as string[]).includes(providerParam)
    ? (providerParam as AIProvider)
    : undefined;

  const credentials = await listCredentials(provider);
  return jsonWithRequestContext({ credentials }, { status: 200 }, access.context);
}

export async function POST(req: NextRequest) {
  const access = await requireAIConfigure(req);
  if ("error" in access) return access.error;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return errorWithRequestContext("BAD_REQUEST", "Invalid AI credential payload", 400, access.context);
  }

  try {
    const credential = await createCredential(access.session.user.id, {
      provider: parsed.data.provider,
      label: parsed.data.label,
      apiKey: parsed.data.apiKey,
      enabled: parsed.data.enabled,
      priority: parsed.data.priority,
      baseUrlOverride: parsed.data.baseUrlOverride || null,
      modelOverride: parsed.data.modelOverride || null,
    });
    return jsonWithRequestContext({ credential }, { status: 201 }, access.context);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Credential creation failed";
    return errorWithRequestContext("BAD_REQUEST", message, 400, access.context);
  }
}
