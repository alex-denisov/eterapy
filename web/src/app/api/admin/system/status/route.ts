import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { getAdminSystemStatus } from "@/lib/admin-system-status";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { requestContextFromHeaders } from "@/lib/request-context";

export async function GET(req: NextRequest) {
  const context = requestContextFromHeaders(req.headers);
  const session = await auth();
  const role = session?.user?.role ?? "";

  if (!session?.user?.id || !["ADMIN", "SUPERADMIN"].includes(role)) {
    return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);
  }

  const permissions = await getUserPermissions(session.user.id, role);
  if (!permissions.includes("system.read")) {
    return errorWithRequestContext("FORBIDDEN", "Forbidden", 403, context);
  }

  const status = await getAdminSystemStatus(context);
  return jsonWithRequestContext(status, { status: 200 }, context);
}
