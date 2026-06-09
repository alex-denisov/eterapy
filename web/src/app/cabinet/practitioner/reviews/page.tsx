export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { loginUrl } from "@/lib/subdomain";

export default async function PractitionerReviewsPage() {
  const session = await auth();
  if (!session) redirect(loginUrl());
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user!.id },
    include: {
      reviews: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } } },
    },
  });
  if (!practitioner) redirect("/cabinet/practitioner");

  // B359 / Интерфейс 11: mark reviews as seen so the sidebar «новых отзывов»
  // badge resets. Best-effort — a failed stamp must not break the page render.
  await db.practitioner
    .update({ where: { id: practitioner.id }, data: { reviewsSeenAt: new Date() } })
    .catch(() => {});

  const avg = practitioner.reviewCount > 0
    ? (practitioner.ratingSum / practitioner.reviewCount).toFixed(1)
    : null;

  return (
    <div className="max-w-4xl px-4 py-8 sm:px-6" data-testid="practitioner-reviews-page">
      <div className="mb-6 flex items-center gap-4">
        <h1 className="soft-h1">Отзывы</h1>
        {avg && (
          <div className="soft-badge soft-badge-warm flex items-center gap-1.5">
            <span style={{ fontFamily: "var(--font-heading)", fontWeight: 600 }}>{avg}</span>
            <span>★</span>
            <span style={{ fontSize: 11 }}>{practitioner.reviewCount} отзывов</span>
          </div>
        )}
      </div>
      <div className="mb-5 grid gap-3 sm:grid-cols-3" data-testid="practitioner-review-compliance">
        {[
          ["Опубликованы", practitioner.reviews.filter((r) => r.status === "PUBLISHED").length],
          ["На проверке", practitioner.reviews.filter((r) => r.status === "REVIEW").length],
          ["Скрыты", practitioner.reviews.filter((r) => r.status === "HIDDEN").length],
        ].map(([label, value]) => (
          <div key={label} className="soft-card-flat p-3">
            <p className="text-xs text-[var(--soft-ink-faint)]">{label}</p>
            <p className="font-heading text-2xl font-semibold text-[var(--soft-bordeaux)]">{value}</p>
          </div>
        ))}
      </div>

      {practitioner.reviews.length === 0 ? (
        <p className="text-[var(--soft-ink-soft)] text-sm">Пока нет отзывов. Они появятся после завершённых сессий.</p>
      ) : (
        <div className="space-y-4">
          {practitioner.reviews.map((r) => (
            <div key={r.id} className="soft-card p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">{r.author?.name ?? "Клиент"}</span>
                <div className="flex items-center gap-2">
                  {r.status !== "PUBLISHED" && (
                    <span className="soft-badge soft-badge-lilac text-[11px]">
                      {r.status === "REVIEW" ? "на проверке" : "скрыт"}
                    </span>
                  )}
                  <div className="flex items-center gap-1" style={{ color: "var(--soft-terracotta)" }}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <span key={i} style={{ opacity: i < r.rating ? 1 : 0.2 }}>★</span>
                    ))}
                  </div>
                </div>
              </div>
              {r.text && <p className="text-sm leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>{r.text}</p>}
              {(r.riskScore > 0 || r.riskFlags.length > 0) && (
                <p className="mt-2 text-xs text-[var(--soft-ink-faint)]">
                  Модерация: {r.riskScore}/100{r.riskFlags.length > 0 ? ` · ${r.riskFlags.slice(0, 3).join(", ")}` : ""}
                </p>
              )}
              <p className="mt-2 text-xs" style={{ color: "var(--soft-ink-faint)" }}>
                {new Date(r.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
