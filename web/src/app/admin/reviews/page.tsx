export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { PageContainer } from "@/components/ui/page-container";
import { ReviewsManager } from "./reviews-manager";

export default async function AdminReviewsPage() {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session || !["ADMIN", "SUPERADMIN", "MODERATOR"].includes(role)) {
    redirect("/admin");
  }

  const canDelete = role === "ADMIN" || role === "SUPERADMIN";

  const reviews = await db.review.findMany({
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
  });

  const pendingCount = reviews.filter((r) => r.status === "REVIEW").length;

  const serialized = reviews.map((r) => ({
    id: r.id,
    rating: r.rating,
    text: r.text,
    status: r.status,
    riskScore: r.riskScore,
    riskFlags: r.riskFlags,
    createdAt: r.createdAt.toISOString(),
    authorName: r.author?.name ?? "Аноним",
    authorEmail: r.author?.email ?? "",
    practitionerName: r.practitioner?.user?.name ?? "—",
    practitionerSlug: r.practitioner?.slug ?? "",
  }));

  return (
    <PageContainer maxWidth="full">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="premium-eyebrow">Модерация</div>
          <h1 className="premium-title mt-3 text-3xl md:text-4xl">Отзывы на практиков</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Утверждение, скрытие и удаление отзывов клиентов
          </p>
        </div>
        {pendingCount > 0 && (
          <div
            className="flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5"
            data-testid="admin-reviews-pending-count"
          >
            <span className="text-sm font-medium text-amber-500">
              {pendingCount} на проверке
            </span>
          </div>
        )}
      </div>

      <ReviewsManager reviews={serialized} canDelete={canDelete} />
    </PageContainer>
  );
}
