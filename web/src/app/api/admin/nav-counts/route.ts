import { auth } from "@/lib/auth";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { getAdminNavCounts } from "@/lib/admin-nav-counts";

export const dynamic = "force-dynamic";

// INC-065: live sidebar counters for the admin shell. The layout renders the
// SSR snapshot; this endpoint lets the client re-sync after mutations,
// focus/visibility changes and on a backstop poll without a full reload.
export async function GET() {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session?.user?.id || !["ADMIN", "SUPERADMIN"].includes(role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const permissions = await getUserPermissions(session.user.id, role);
  const counts = await getAdminNavCounts(permissions);
  return Response.json(counts, { headers: { "Cache-Control": "no-store" } });
}
