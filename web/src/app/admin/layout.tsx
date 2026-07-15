import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { AdminShell } from "./admin-shell";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { loginUrl, logoutUrl, mainUrl } from "@/lib/subdomain";
import { noIndexRobots } from "@/lib/seo";
import { getSessionAccountAccessState, inactiveAccountReason } from "@/lib/account-state";

export const metadata: Metadata = {
  robots: noIndexRobots,
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session) redirect(loginUrl());
  const accountState = await getSessionAccountAccessState(session);
  const inactiveReason = inactiveAccountReason(accountState);
  if (inactiveReason) redirect(`${logoutUrl()}?reason=${inactiveReason}`);
  if (!["ADMIN", "SUPERADMIN"].includes(role)) redirect(mainUrl("/"));

  const permissions = await getUserPermissions(session.user!.id!, role);

  // X9: sidebar «непрочитанные» counters — actionable items awaiting a moderator.
  const [applications, bookings, complaints, reviews, libraryRequests, support] = await Promise.all([
    db.practitionerApplication.count({ where: { status: "PENDING" } }).catch(() => 0),
    db.booking.count({ where: { status: "PENDING" } }).catch(() => 0),
    db.complaint.count({ where: { status: "OPEN" } }).catch(() => 0),
    db.review.count({ where: { status: "REVIEW" } }).catch(() => 0),
    db.dialogue.count({ where: { libraryStatus: "PENDING_REVIEW", deletedAt: null } }).catch(() => 0),
    permissions.includes("support.manage")
      ? db.supportConversation.count({ where: { status: "OPEN" } }).catch(() => 0)
      : Promise.resolve(0),
  ]);
  const counts = { applications, bookings, complaints, reviews, libraryRequests, support, quality: applications + complaints + reviews + libraryRequests };

  return (
    <AdminShell user={session.user} role={role} permissions={permissions} counts={counts}>
      {children}
    </AdminShell>
  );
}
