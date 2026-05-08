export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";

export default async function PractitionerReviewsPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user!.id },
    include: {
      reviews: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } } },
    },
  });
  if (!practitioner) redirect("/cabinet/practitioner");

  const avg = practitioner.reviewCount > 0
    ? (practitioner.ratingSum / practitioner.reviewCount).toFixed(1)
    : null;

  return (
    <div className="max-w-4xl px-4 py-8 sm:px-6">
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

      {practitioner.reviews.length === 0 ? (
        <p className="text-[var(--soft-ink-soft)] text-sm">Пока нет отзывов. Они появятся после завершённых сессий.</p>
      ) : (
        <div className="space-y-4">
          {practitioner.reviews.map((r) => (
            <div key={r.id} className="soft-card p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">{r.author?.name ?? "Клиент"}</span>
                <div className="flex items-center gap-1" style={{ color: "var(--soft-terracotta)" }}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span key={i} style={{ opacity: i < r.rating ? 1 : 0.2 }}>★</span>
                  ))}
                </div>
              </div>
              {r.text && <p className="text-sm leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>{r.text}</p>}
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
