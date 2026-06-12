"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * Composite CTA on /library/[slug] (B382 funnel):
 * - Shows the live "прошли разбор" counter (baseline + persisted increments).
 * - "Разобрать свой вопрос" navigates into the paid service mapped to the card's
 *   topic (`href`), incrementing the counter server-side on click.
 * - Microcopy ("первая часть разбора бесплатно · полный — за N баллов") comes from
 *   resolveLibraryCta so price never drifts from the product page (B366 source).
 */
export function LibraryEntryCta({
  slug,
  baseline,
  href,
  label,
  teaserNote,
  product,
}: {
  slug: string;
  baseline: number;
  href: string;
  label: string;
  teaserNote: string;
  product: string;
}) {
  const [count, setCount] = useState<number>(baseline);

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
          <p className="text-xs text-[#e8c4b8]/80 md:text-right">{teaserNote}</p>
        </div>
      </div>
    </section>
  );
}
