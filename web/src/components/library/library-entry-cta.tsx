"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { track } from "@/lib/analytics";
import { SHARE_EVENTS, libraryStartParam, telegramDeepLink } from "@/lib/share";
import { ShareButton } from "@/components/share/share-button";
import { consumeReferralSource } from "@/components/referral-tracker";

/**
 * Composite CTA on /library/[slug] (B382 funnel + B390 viral loop):
 * - Shows the topic response counter (published baseline + persisted starts).
 * - The primary free-reflection CTA increments the counter server-side.
 * - B390: «Поделиться» (TG deep-link / web URL) + referred_dialogue_started when
 *   the visitor arrived via a share/deep-link (KPI K-reg).
 */
export function LibraryEntryCta({
  slug,
  baseline,
  primaryHref,
  primaryLabel,
  primaryProduct,
  secondaryHref,
  secondaryLabel,
  headline,
}: {
  slug: string;
  baseline: number;
  primaryHref: string;
  primaryLabel: string;
  primaryProduct: string;
  secondaryHref: string;
  secondaryLabel: string;
  headline: string;
}) {
  const [count, setCount] = useState<number>(baseline);
  // B390: deep-link для шеринга (мини-апп, если сконфигурирован, иначе web).
  // Считается в рендере (используется только в onClick, в DOM не попадает → нет
  // несоответствия гидрации); на сервере — относительный путь-заглушка.
  const shareUrl = typeof window !== "undefined"
    ? telegramDeepLink(libraryStartParam(slug), `${window.location.origin}/library/${slug}`)
    : `/library/${slug}`;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/library/${encodeURIComponent(slug)}/track`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data.total === "number") setCount(data.total);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [slug]);

  function trackStart() {
    setCount((current) => current + 1);
    // B390: если пришли по шерингу/deep-link — это реферальный старт разбора.
    const referral = consumeReferralSource();
    if (referral) {
      track({ event: SHARE_EVENTS.referredDialogue, surface: "library", properties: { slug, source: referral } });
    }
    void fetch(`/api/library/${encodeURIComponent(slug)}/track`, { method: "POST", keepalive: true });
  }

  return (
    <section
      className="soft-card soft-form-panel mt-10 bg-[var(--soft-bordeaux)] p-6 text-[var(--soft-paper)] md:p-8"
      data-testid="library-entry-cta"
    >
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="soft-eyebrow text-[var(--soft-gold)]">ваша ситуация будет другой</p>
          <h2 className="mt-3 text-2xl font-medium text-[var(--soft-paper)]" style={{ fontFamily: "var(--font-heading)" }}>
            Похожий вопрос — другой контекст
          </h2>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-[#e8c4b8]">
            Начните с собственного вопроса. Первый разбор бесплатный, решение и следующий шаг остаются за вами.
          </p>
          <p className="mt-3 text-xs text-[#e8c4b8]/80" data-testid="library-entry-counter">
            {count.toLocaleString("ru-RU")} откликов по теме
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <Link
            href={primaryHref}
            onClick={trackStart}
            className="soft-button shrink-0 bg-[var(--soft-paper-deep)] text-[var(--soft-bordeaux)] hover:bg-[var(--soft-paper)]"
            data-analytics-event="library_cta_clicked"
            data-analytics-target={primaryHref}
            data-analytics-product={primaryProduct}
            data-testid="library-entry-dialogue-cta"
          >
            {primaryLabel}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <ShareButton
            kind="library"
            headline={headline}
            url={shareUrl}
            surface="library-card"
            label="Поделиться"
            className="text-xs font-medium text-[var(--soft-gold)] underline underline-offset-4 inline-flex items-center gap-1.5"
          />
          <Link
            href={secondaryHref}
            className="text-xs text-[#e8c4b8] underline underline-offset-4"
            data-analytics-event="library_paid_continuation_clicked"
            data-analytics-target={secondaryHref}
            data-analytics-product="library-secondary"
          >
            {secondaryLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}
