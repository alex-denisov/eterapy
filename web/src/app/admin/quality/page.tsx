export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, MessageSquareWarning, ShieldAlert, Star } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { canReviewAntifraud, getAdminAntifraudData } from "@/lib/admin-antifraud";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { PageContainer } from "@/components/ui/page-container";
import { AdminAntifraudPanel } from "../antifraud/admin-antifraud-panel";
import { ReviewsManager } from "../reviews/reviews-manager";

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.05em] text-[var(--soft-ink-soft)]">
        <Icon className="h-4 w-4 text-[var(--soft-bordeaux)]" />
        {label}
      </div>
      <p className="text-2xl font-semibold text-[var(--soft-bordeaux)] tabular-nums">{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-[var(--soft-ink-soft)]">{hint}</p>
    </div>
  );
}

export default async function AdminQualityPage() {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session?.user?.id || !["ADMIN", "SUPERADMIN", "MODERATOR"].includes(role)) redirect("/admin");

  const permissions = await getUserPermissions(session.user.id, role);
  const canReview = role === "ADMIN" || role === "SUPERADMIN" || role === "MODERATOR" || permissions.includes("safety.review");
  const canDeleteReviews = role === "ADMIN" || role === "SUPERADMIN";
  const canOpenAntifraud = canReviewAntifraud(role, permissions);
  if (!canReview && !canOpenAntifraud) redirect("/admin");

  const [reviews, complaintsCount, antifraudData] = await Promise.all([
    canReview
      ? db.review.findMany({
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        take: 200,
        select: {
          id: true,
          rating: true,
          text: true,
          status: true,
          riskScore: true,
          riskFlags: true,
          createdAt: true,
          author: { select: { name: true, email: true } },
          practitioner: {
            select: { id: true, slug: true, user: { select: { name: true } } },
          },
        },
      })
      : Promise.resolve([]),
    db.complaint.count().catch(() => 0),
    canOpenAntifraud ? getAdminAntifraudData() : Promise.resolve(null),
  ]);

  const serializedReviews = reviews.map((review) => ({
    id: review.id,
    rating: review.rating,
    text: review.text,
    status: review.status,
    riskScore: review.riskScore,
    riskFlags: review.riskFlags,
    createdAt: review.createdAt.toISOString(),
    authorName: review.author?.name ?? "Аноним",
    authorEmail: review.author?.email ?? "",
    practitionerName: review.practitioner?.user?.name ?? "—",
    practitionerSlug: review.practitioner?.slug ?? "",
  }));
  const pendingReviews = serializedReviews.filter((review) => review.status === "REVIEW").length;

  return (
    <PageContainer maxWidth="full">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="premium-eyebrow">product operations · quality</p>
          <h1 className="premium-title mt-2 text-3xl md:text-4xl">Операции и качество</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Жалобы, отзывы, модерация, риск-сигналы и антифрод-контроль клиентских и практических сценариев.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="soft-admin-action" href="/admin/complaints">Жалобы</Link>
          <Link className="soft-admin-action" href="/admin/reviews">Отзывы</Link>
          <Link className="soft-admin-action" href="/admin/antifraud">Антифрод</Link>
        </div>
      </div>

      <section className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={MessageSquareWarning} label="Жалобы" value={formatNumber(complaintsCount)} hint="Обращения и спорные пользовательские ситуации." />
        <MetricCard icon={Star} label="Отзывы на проверке" value={formatNumber(pendingReviews)} hint="Модерация публикации, скрытия, редактирования и удаления." />
        <MetricCard icon={ShieldAlert} label="Антифрод очередь" value={formatNumber(antifraudData?.metrics.reviewQueue ?? 0)} hint="События, которые требуют ручного решения." />
        <MetricCard icon={AlertTriangle} label="High risk" value={formatNumber(antifraudData?.metrics.highRiskEvents ?? 0)} hint="Высокий риск по referrals, credits, payouts и review abuse." />
      </section>

      {canReview && (
        <section className="mb-6 rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)]">
          <div className="border-b border-[var(--soft-paper-edge)] px-4 py-3">
            <h2 className="text-base font-semibold">Отзывы</h2>
            <p className="mt-1 text-xs text-[var(--soft-ink-soft)]">
              Колонки сохранены как в действующем разделе: оценка, отзыв, автор, практик, дата, статус и действия.
            </p>
          </div>
          <div className="p-4">
            <ReviewsManager reviews={serializedReviews} canDelete={canDeleteReviews} />
          </div>
        </section>
      )}

      {antifraudData && (
        <section className="rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)]">
          <div className="border-b border-[var(--soft-paper-edge)] px-4 py-3">
            <h2 className="text-base font-semibold">Антифрод</h2>
            <p className="mt-1 text-xs text-[var(--soft-ink-soft)]">
              Мониторинг referral risk, credit holds, payout holds, риск-отзывов и апелляций.
            </p>
          </div>
          <div className="p-4">
            <AdminAntifraudPanel initialData={antifraudData} />
          </div>
        </section>
      )}
    </PageContainer>
  );
}
