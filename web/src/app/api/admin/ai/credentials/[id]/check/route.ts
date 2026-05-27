import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { checkCredentialHealth } from "@/lib/ai-gateway/credentials";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { requestContextFromHeaders } from "@/lib/request-context";

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

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const access = await requireSuperadminAIConfigure(req);
  if ("error" in access) return access.error;

  const { id } = await ctx.params;
  try {
    const result = await checkCredentialHealth(access.session.user.id, id);
    return jsonWithRequestContext(result, { status: 200 }, access.context);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Credential healthcheck failed";
    return errorWithRequestContext("BAD_REQUEST", message, 400, access.context);
  }
}
