import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import {
  foreignProviderRegistryToCsv,
  listForeignProviderRegistry,
} from "@/lib/ai-gateway/foreign-provider-registry";
import { LEGAL_CROSS_BORDER_PERMISSION } from "@/lib/ai-gateway/cross-border-gate";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { requestContextFromHeaders } from "@/lib/request-context";

export async function GET(req: NextRequest) {
  const context = requestContextFromHeaders(req.headers);
  const session = await auth();
  const role = session?.user?.role ?? "";

  if (!session?.user?.id || role !== "SUPERADMIN") {
    return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);
  }

  const permissions = await getUserPermissions(session.user.id, role);
  if (!permissions.includes(LEGAL_CROSS_BORDER_PERMISSION)) {
    return errorWithRequestContext("FORBIDDEN", "Forbidden", 403, context);
  }

  const rows = await listForeignProviderRegistry();
  const format = new URL(req.url).searchParams.get("format");
  if (format === "csv") {
    return new Response(foreignProviderRegistryToCsv(rows), {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="foreign-provider-registry.csv"',
        "x-request-id": context.requestId,
      },
    });
  }

  return jsonWithRequestContext({
    generatedAt: new Date().toISOString(),
    rows,
  }, { status: 200 }, context);
}
