export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canReviewAntifraud, getAdminAntifraudData } from "@/lib/admin-antifraud";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { PageContainer } from "@/components/ui/page-container";
import { AdminAntifraudPanel } from "./admin-antifraud-panel";

export default async function AdminAntifraudPage() {
  const session = await auth();
  const role = session?.user?.role ?? "";
  const userId = session?.user?.id;
  if (!session || !userId || !["ADMIN", "SUPERADMIN"].includes(role)) redirect("/admin");

  const permissions = await getUserPermissions(userId, role);
  if (!canReviewAntifraud(role, permissions)) redirect("/admin");

  const data = await getAdminAntifraudData();

  return (
    <PageContainer maxWidth="full">
      <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <div className="premium-eyebrow">Risk operations</div>
          <h1 className="premium-title mt-3 text-3xl md:text-4xl">Антифрод</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Риск-сигналы, ручная проверка, апелляции и аудит решений.
          </p>
        </div>
        <div className="rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] px-3 py-2 text-xs text-muted-foreground">
          Очередь проверки: <span className="font-medium text-foreground">{data.metrics.reviewQueue}</span>
        </div>
      </div>
      <AdminAntifraudPanel initialData={data} />
    </PageContainer>
  );
}
