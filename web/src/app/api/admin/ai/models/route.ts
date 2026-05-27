import { AIProvider } from "@prisma/client";
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { requestContextFromHeaders } from "@/lib/request-context";
import {
  AIModelFetchError,
  listCachedModels,
  refreshModelsForProvider,
} from "@/lib/ai-gateway/models";
import { logAudit } from "@/lib/audit";

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

function parseProvider(url: URL): AIProvider | null {
  const value = url.searchParams.get("provider");
  if (!value) return null;
  return (Object.values(AIProvider) as string[]).includes(value)
    ? (value as AIProvider)
    : null;
}

export async function GET(req: NextRequest) {
  const access = await requireAIConfigure(req);
  if ("error" in access) return access.error;

  const url = new URL(req.url);
  const provider = parseProvider(url);

  if (provider) {
    const models = await listCachedModels(provider);
    return jsonWithRequestContext({ provider, models }, { status: 200 }, access.context);
  }

  const all: Record<string, Awaited<ReturnType<typeof listCachedModels>>> = {};
  for (const value of Object.values(AIProvider)) {
    all[value] = await listCachedModels(value);
  }
  return jsonWithRequestContext({ models: all }, { status: 200 }, access.context);
}

export async function POST(req: NextRequest) {
  const access = await requireAIConfigure(req);
  if ("error" in access) return access.error;

  const url = new URL(req.url);
  const provider = parseProvider(url);
  if (!provider) {
    return errorWithRequestContext(
      "BAD_REQUEST",
      "provider query param is required (OPENAI|ANTHROPIC|FIREWORKS|OPENROUTER|GEMINI)",
      400,
      access.context,
    );
  }

  try {
    const result = await refreshModelsForProvider(provider);
    await logAudit(access.session.user.id, "AI_MODELS_REFRESH", provider, JSON.stringify({
      count: result.count,
      removed: result.removed,
    }));
    const models = await listCachedModels(provider);
    return jsonWithRequestContext({
      provider,
      refreshedAt: result.fetchedAt.toISOString(),
      count: result.count,
      removed: result.removed,
      models,
    }, { status: 200 }, access.context);
  } catch (err) {
    const message = err instanceof AIModelFetchError ? err.message
      : err instanceof Error ? err.message
      : "Model refresh failed";
    return errorWithRequestContext("UPSTREAM_ERROR", message, 502, access.context);
  }
}
