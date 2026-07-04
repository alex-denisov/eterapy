"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, EyeOff, Loader2 } from "lucide-react";

// B464 round-6 #6 — redesigned разбор row per the recovered b464-home mockup
// (.row/.topic-chip/.acts): colour topic-chip anchor + title/date + a compact
// icon-action cluster. «Открыть» opens the разбор; «Скрыть» removes it from
// the preview and the diary map (reversible on /diary). Destructive delete and
// token-share stay on the fuller /diary management surface.

export interface CabinetResultRowItem {
  kind: "dialogue" | "product";
  id: string;
  title: string;
  topicLabel: string;
  when: string;
  href: string;
}

export function CabinetResultRow({ item }: { item: CabinetResultRowItem }) {
  const router = useRouter();
  const [hiding, setHiding] = useState(false);
  const [hidden, setHidden] = useState(false);

  async function hide() {
    if (hiding) return;
    setHiding(true);
    try {
      const res = await fetch("/api/cabinet/diary/visibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: item.kind, id: item.id, hidden: true }),
      });
      if (!res.ok) throw new Error();
      setHidden(true);
      // Refetch the server-rendered preview so the slot backfills with the next разбор.
      router.refresh();
    } catch {
      setHiding(false);
    }
  }

  if (hidden) return null;

  return (
    <div className="soft-result-row" data-testid="cabinet-result-row">
      {/* Chip sits ABOVE the title inside the body column: a long product label
          («Подробный разбор») as a left-hand chip crushed the title to one glyph
          per line on 375px. Stacked, the title always gets the full width. */}
      <Link href={item.href} className="soft-result-body" data-testid="cabinet-result-open">
        <span className="soft-result-chip" title={item.topicLabel}>{item.topicLabel}</span>
        <span className="soft-result-title">{item.title}</span>
        <span className="soft-result-date">{item.when}</span>
      </Link>
      <div className="soft-result-acts">
        <Link
          href={item.href}
          className="soft-result-act soft-result-act-primary"
          aria-label={`Открыть: ${item.title}`}
          title="Открыть"
        >
          <ArrowRight className="size-[18px]" aria-hidden="true" />
        </Link>
        <button
          type="button"
          onClick={hide}
          disabled={hiding}
          className="soft-result-act"
          aria-label={`Скрыть из ленты: ${item.title}`}
          title="Скрыть из ленты"
          data-testid="cabinet-result-hide"
        >
          {hiding ? <Loader2 className="size-[18px] animate-spin" aria-hidden="true" /> : <EyeOff className="size-[18px]" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
