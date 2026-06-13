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
 * - Shows the live "прошли разбор" counter (baseline + persisted increments).
 * - "Разобрать свой вопрос" navigates into the paid service mapped to the card's
 *   topic (`href`), incrementing the counter server-side on click.
 * - B390: «Поделиться» (TG deep-link / web URL) + referred_dialogue_started when
 *   the visitor arrived via a share/deep-link (KPI K-reg).
 */
export function LibraryEntryCta({
  slug,
  baseline,
  href,
  label,
  teaserNote,
  product,
  headline,
}: {
  slug: string;
  baseline: number;
  href: string;
  label: string;
  teaserNote: string;
  product: string;
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
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data || typeof data.total !== "number") return;
        setCount(data.total);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function trackAndNavigate(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    setCount((current) => current + 1);
    // B390: если пришли по шерингу/deep-link — это реферальный старт разбора.
    const referral = consumeReferralSource();
    if (referral) {
      track({ event: SHARE_EVENTS.referredDialogue, surface: "library", properties: { slug, source: referral } });
    }
    try {
      await fetch(`/api/library/${encodeURIComponent(slug)}/track`, { method: "POST" });
    } catch {
      // Best-effort — navigation still happens.
    }
    window.location.assign(href);
  }

  return (
    <section
      className="soft-card soft-form-panel mt-10 bg-[var(--soft-bordeaux)] p-6 text-[var(--soft-paper)] md:p-8"
      data-testid="library-entry-cta"
    >
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="soft-eyebrow text-[var(--soft-gold)]">а как у вас</p>
          <h2 className="mt-3 text-2xl font-medium text-[var(--soft-paper)]" style={{ fontFamily: "var(--font-heading)" }}>
            Похожий вопрос — другой контекст
          </h2>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-[#e8c4b8]">
            Разбор будет ваш, не этот. Никто не увидит ваших слов без согласия.
          </p>
          <p className="mt-3 text-xs text-[#e8c4b8]/80" data-testid="library-entry-counter">
            {count.toLocaleString("ru-RU")} прошли похожий разбор
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <Link
            href={href}
            onClick={trackAndNavigate}
            className="soft-button shrink-0 bg-[var(--soft-paper-deep)] text-[var(--soft-bordeaux)] hover:bg-[var(--soft-paper)]"
            data-analytics-event="library_cta_clicked"
            data-analytics-target={href}
            data-analytics-product={product}
            data-testid="library-entry-dialogue-cta"
          >
            {label}
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
          <p className="text-xs text-[#e8c4b8]/80 md:text-right">{teaserNote}</p>
        </div>
      </div>
    </section>
  );
}
