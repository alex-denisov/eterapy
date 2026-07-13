export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { appUrl, loginUrl } from "@/lib/subdomain";

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

  const published = practitioner.reviews.filter((r) => r.status === "PUBLISHED");
  const dist = [5, 4, 3, 2, 1].map((star) => ({ star, n: published.filter((r) => r.rating === star).length }));
  const distMax = Math.max(1, ...dist.map((d) => d.n));
  const reviewWord = practitioner.reviewCount === 1 ? "отзыв" : practitioner.reviewCount < 5 ? "отзыва" : "отзывов";

  return (
    <>
      {/* МОБАЙЛ — 1-в-1 по mockup practitioner-more-reviews */}
      <div className="pcab-screen md:hidden" data-pcab-top data-testid="practitioner-reviews-mobile">
        <div className="pcab-topbar">
          <Link href={appUrl("/practitioner/more")} className="pcab-roundbtn" aria-label="Назад">
            <ChevronLeft width={19} height={19} aria-hidden="true" />
          </Link>
          <span className="pcab-topbar-title">Отзывы</span>
          <span className="pcab-topbar-spacer" />
        </div>

        {practitioner.reviewCount === 0 ? (
          <p className="pcab-lead">Пока нет отзывов. Они появятся после завершённых сессий.</p>
        ) : (
          <>
            <div className="pcab-revsum">
              <div className="pcab-revscore">
                <div className="pcab-revnum">{avg?.replace(".", ",")}</div>
                <div className="pcab-revstars" aria-hidden="true">★★★★★</div>
                <div className="pcab-revcnt">{practitioner.reviewCount} {reviewWord}</div>
              </div>
              <div className="pcab-revbars">
                {dist.map((d) => (
                  <div key={d.star} className="pcab-revbar">
                    <span className="pcab-revbar-n">{d.star}</span>
                    <span className="pcab-revtrack">
                      <span className="pcab-revfill" style={{ width: `${Math.round((d.n / distMax) * 100)}%` }} />
                    </span>
                    <span className="pcab-revbar-c">{d.n}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pcab-section-head" style={{ marginTop: 18, marginBottom: 4 }}>
              <span className="pcab-eyebrow">Последние отзывы</span>
            </div>
            {practitioner.reviews.map((r) => (
              <div key={r.id} className="pcab-rev">
                <div className="pcab-rev-top">
                  <span className="pcab-rev-av" aria-hidden="true">{(r.author?.name ?? "К")[0]}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="pcab-rev-name">
                      {r.author?.name ?? "Клиент"}
                      {r.status !== "PUBLISHED" && (
                        <span className="pcab-needchip" style={{ marginLeft: 6 }}>{r.status === "REVIEW" ? "на проверке" : "скрыт"}</span>
                      )}
                    </div>
                    <div className="pcab-rev-when">
                      {new Date(r.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" })}
                    </div>
                  </div>
                  <div className="pcab-rev-stars" aria-label={`${r.rating} из 5`}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <span key={i} style={{ opacity: i < r.rating ? 1 : 0.22 }}>★</span>
                    ))}
                  </div>
                </div>
                {r.text && <div className="pcab-rev-text">{r.text}</div>}
              </div>
            ))}
          </>
        )}
      </div>

      {/* ДЕСКТОП — прежний вид (ждёт новых десктоп-макетов R9-5) */}
      <div className="hidden max-w-4xl px-4 py-8 sm:px-6 md:block" data-testid="practitioner-reviews-page">
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
    </>
  );
}
