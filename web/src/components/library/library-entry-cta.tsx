"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * Composite CTA used on /library/[slug]:
 * - Shows the live "прошли разбор" counter (baseline + persisted increments).
 * - When the user clicks "Начать свой разбор", we increment the counter
 *   server-side via POST /api/library/[slug]/track and then navigate to
 *   /checkin so the user can start a fresh dialogue with their own context.
 */
export function LibraryEntryCta({
  slug,
  baseline,
  checkinHref,
}: {
  slug: string;
  baseline: number;
  checkinHref: string;
}) {
  const [count, setCount] = useState<number>(baseline);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/library/${encodeURIComponent(slug)}/track`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (cancelled || !data || typeof data.total !== "number") return;
        setCount(data.total);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [slug]);

  async function trackAndNavigate(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    setCount((current) => current + 1);
    try {
      await fetch(`/api/library/${encodeURIComponent(slug)}/track`, { method: "POST" });
    } catch {
      // Best-effort — navigation still happens.
    }
    window.location.assign(checkinHref);
  }

  return (
    <section className="soft-card soft-form-panel mt-8 bg-[var(--soft-bordeaux)] p-6 text-[var(--soft-paper)] md:p-8" data-testid="library-entry-cta">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="soft-eyebrow text-[var(--soft-gold)]">а как у вас</p>
          <h2 className="mt-3 text-2xl font-medium text-[var(--soft-paper)]" style={{ fontFamily: "var(--font-heading)" }}>Похожий вопрос — другой контекст</h2>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-[#e8c4b8]">
            Разбор будет ваш, не этот. Никто не увидит ваших слов без согласия.
          </p>
          <p className="mt-3 text-xs text-[#e8c4b8]/80" data-testid="library-entry-counter">
            {count.toLocaleString("ru-RU")} прошли похожий разбор
          </p>
        </div>
        <Link
          href={checkinHref}
          onClick={trackAndNavigate}
          className="soft-button shrink-0 bg-[var(--soft-paper-deep)] text-[var(--soft-bordeaux)] hover:bg-[var(--soft-paper)]"
          data-analytics-event="dialogue_cta_clicked"
          data-analytics-target={checkinHref}
          data-testid="library-entry-dialogue-cta"
        >
          Начать свой разбор
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
