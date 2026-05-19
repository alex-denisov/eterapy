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
          <p className="soft-eyebrow">antifraud · monetization safety</p>
          <h1 className="soft-h1 mt-2">Риск-сигналы и апелляции</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Защищаем credits, referrals, paid unlocks, practitioner payout holds и доверие в воронке.
            Награды подтверждаются только после значимого действия, спорные решения остаются на ручной проверке.
          </p>
        </div>
        <div className="rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] px-3 py-2 text-xs text-[var(--soft-ink-soft)]">
          Очередь проверки: <span className="font-medium text-foreground">{data.metrics.reviewQueue}</span>
        </div>
      </div>
      <AdminAntifraudPanel initialData={data} />
    </PageContainer>
  );
}
