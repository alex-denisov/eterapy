export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { ApplicationsManager } from "./applications-manager";
import { PageContainer } from "@/components/ui/page-container";

export default async function AdminApplicationsPage() {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session || !["ADMIN", "SUPERADMIN"].includes(role)) redirect("/admin");

  const applications = await db.practitionerApplication.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <PageContainer maxWidth="full">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Заявки практиков</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Входящие заявки от кандидатов на роль практика</p>
        </div>
        <div className="flex gap-3 text-sm text-muted-foreground">
          <span>Новых: <strong className="text-foreground">{applications.filter(a => a.status === "PENDING").length}</strong></span>
          <span>Всего: {applications.length}</span>
        </div>
      </div>
      <ApplicationsManager applications={applications.map(a => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
      }))} adminRole={role} />
    </PageContainer>
  );
}
