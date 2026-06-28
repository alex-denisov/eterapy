"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { listHrefFromReferrer } from "@/lib/practitioner-tabs";

const FALLBACK = "/practitioners";

/**
 * B458 round back-arrow (Tarot/library parity) + B460 filter persistence.
 *
 * SSR renders the bare `/practitioners` (safe for no-JS and shared links); on
 * mount we upgrade the href to the referrer when it is our own catalog, so a
 * category filter chosen before opening this profile is preserved when the
 * arrow is clicked. Browser back is handled separately by the grid pinning the
 * tab into the URL.
 */
export function PractitionerBackLink() {
  const [href, setHref] = useState(FALLBACK);

  useEffect(() => {
    // `document.referrer` is browser-only — read post-mount so SSR and the first
    // client render both emit the FALLBACK href (no hydration mismatch), then
    // upgrade to the filtered catalog URL.
    const fromList = listHrefFromReferrer(document.referrer, window.location.origin);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (fromList) setHref(fromList);
  }, []);

  return (
    <Link
      href={href}
      aria-label="Все специалисты"
      data-testid="practitioner-back"
      className="-ml-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--soft-ink-soft)] transition-colors hover:bg-[var(--soft-paper-card)] hover:text-[var(--soft-bordeaux)]"
    >
      <ChevronLeft className="size-5" aria-hidden="true" />
    </Link>
  );
}
