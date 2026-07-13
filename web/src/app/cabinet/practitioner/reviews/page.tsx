export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { appUrl, loginUrl } from "@/lib/subdomain";
import { PractitionerReviewsList, type ReviewItem } from "./reviews-list";

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

  const reviewItems: ReviewItem[] = practitioner.reviews.map((r) => ({
    id: r.id,
    authorName: r.author?.name ?? null,
    rating: r.rating,
    text: r.text,
    status: r.status,
    createdAtIso: r.createdAt.toISOString(),
    riskScore: r.riskScore,
    riskFlags: r.riskFlags,
  }));

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
            <PractitionerReviewsList reviews={reviewItems} variant="pcab" />
          </>
        )}
      </div>

      {/* ДЕСКТОП R9-5 — 1-в-1 practitioner-desktop-reviews-v2 (список слева +
          сводка/«как это работает» справа). Ответы практика не предусмотрены. */}
      <div className="mx-auto hidden w-full max-w-6xl px-4 py-8 sm:px-6 md:block" style={{ paddingBottom: 80 }} data-testid="practitioner-reviews-page">
        <p className="soft-eyebrow">Практика</p>
        <h1 className="soft-h1 mt-2">Отзывы</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--soft-ink-soft)]">
          Оставляют только клиенты после проведённой сессии. Отзывы видны в вашей публичной карточке.
        </p>

        {practitioner.reviews.length === 0 ? (
          <div className="soft-card mt-6 p-8 text-center">
            <p className="text-sm text-[var(--soft-ink-soft)]">Пока нет отзывов. Они появятся после завершённых сессий.</p>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
            {/* Список отзывов */}
            <div className="soft-card p-5 sm:p-6" data-testid="practitioner-review-list">
              <p className="soft-eyebrow mb-4">{practitioner.reviewCount} {reviewWord}</p>
              <PractitionerReviewsList reviews={reviewItems} variant="desktop" />
            </div>

            {/* Сводка + как это работает */}
            <div className="flex flex-col gap-4">
              <div className="soft-card p-6 text-center">
                <p className="font-heading text-[46px] font-semibold leading-none text-[var(--soft-bordeaux)]">
                  {avg?.replace(".", ",") ?? "—"}
                </p>
                <div className="mt-2 flex justify-center gap-0.5" aria-hidden="true">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span key={i} className="text-[15px]" style={{ color: "#D8A24A" }}>★</span>
                  ))}
                </div>
                <p className="mt-2 text-xs text-[var(--soft-ink-faint)]">на основе {practitioner.reviewCount} {reviewWord}</p>
                <div className="mt-4 space-y-2 text-left">
                  {dist.map((d) => (
                    <div key={d.star} className="flex items-center gap-2.5 text-xs text-[var(--soft-ink-faint)]">
                      <span className="w-3 text-right text-[var(--soft-ink-soft)]">{d.star}</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--soft-paper-deep)]">
                        <span className="block h-full rounded-full" style={{ width: `${Math.round((d.n / Math.max(1, published.length)) * 100)}%`, background: "#D8A24A" }} />
                      </span>
                      <span className="w-5 text-right">{d.n}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="soft-card p-5">
                <p className="soft-eyebrow mb-2">Как это работает</p>
                <p className="text-[13px] leading-relaxed text-[var(--soft-ink-faint)]">
                  Оценку и отзыв оставляет только клиент после подтверждённой сессии. Отзывы отображаются как есть — ответы специалиста не предусмотрены. Удалить чужой отзыв нельзя, но при нарушении правил можно пожаловаться модератору.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
