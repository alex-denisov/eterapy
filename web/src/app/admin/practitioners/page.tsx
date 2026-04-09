import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { PractitionersPanel } from "./practitioners-panel";
import { getUserPermissions } from "@/lib/moderator-permissions";

export default async function AdminPractitionersPage() {
  const session = await auth();
  const role = session?.user?.role;
  if (!session || !["ADMIN", "SUPERADMIN"].includes(role)) redirect("/");

  const permissions = await getUserPermissions(session.user!.id!, role);
  if (!permissions.includes("practitioners.view")) redirect("/admin");

  const practitioners = await db.practitioner.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true, blockedAt: true } },
      priceRates: { where: { enabled: true }, orderBy: { durationMin: "asc" }, take: 1 },
    },
  });

  const list = practitioners.map(p => ({
    id: p.id,
    userId: p.userId,
    slug: p.slug,
    name: p.user.name,
    email: p.user.email,
    avatarUrl: p.user.avatarUrl,
    userBlockedAt: p.user.blockedAt ? p.user.blockedAt.toISOString() : null,
    status: p.status,
    title: p.title,
    bio: p.bio,
    experience: p.experience,
    specialties: p.specialties,
    tags: p.tags,
    pricePerSession: p.pricePerSession,
    sessionDuration: p.sessionDuration,
    verified: p.verified,
    founding: p.founding,
    reviewCount: p.reviewCount,
    sessionCount: p.sessionCount,
    minRate: p.priceRates[0]?.priceRub ?? null,
    minRateDuration: p.priceRates[0]?.durationMin ?? null,
    createdAt: p.createdAt.toISOString(),
  }));

  return (
    <div className="px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Практики</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Управление аккаунтами практиков</p>
        </div>
        <span className="text-sm text-muted-foreground">Всего: {list.length}</span>
      </div>
      <PractitionersPanel practitioners={list} adminRole={role} permissions={permissions} />
    </div>
  );
}
