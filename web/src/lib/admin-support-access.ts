import { auth } from "@/lib/auth";
import { getUserPermissions } from "@/lib/moderator-permissions";

/** Single server-side authorization gate for support content and actions. */
export async function getSupportOperatorAccess() {
  const session = await auth();
  const userId = session?.user?.id;
  const role = session?.user?.role ?? "";
  if (!userId || !["ADMIN", "SUPERADMIN"].includes(role)) return null;

  const permissions = await getUserPermissions(userId, role);
  if (!permissions.includes("support.manage")) return null;
  return { session, userId, role };
}
