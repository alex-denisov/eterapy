"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Gift, Share2 } from "lucide-react";
import { appUrl, mainUrl } from "@/lib/subdomain";

// B512 §3.5 (механика M4) — result-moment share/gift. Лиловая иконка на строке
// разбора открывает маленькое меню из двух ЧЕСТНЫХ действий:
//   · «Поделиться инсайтом» — обезличенная share-страница (/share, M26 B389):
//     без имён и текста разбора, только тема-приглашение;
//   · «Подарить разбор» — переход на /cabinet/invite (реферальный подарок).
// Opt-in и privacy-preserving: ничего не публикуется без явного клика.
export function ResultShareAction({
  title,
  shareTopic,
  surface,
  kind,
}: {
  title: string;
  shareTopic: string;
  surface: string;
  kind: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const shareUrl = mainUrl(
    `/share?from=${encodeURIComponent(surface)}&topic=${encodeURIComponent(shareTopic)}&title=${encodeURIComponent(title)}`,
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="soft-result-act soft-result-act-share"
        title="Поделиться инсайтом (анонимно) или подарить разбор"
        aria-label={`Поделиться или подарить: ${title}`}
        data-testid="result-share-action"
      >
        <Share2 className="size-[18px]" aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          data-testid="result-share-menu"
          className="absolute right-0 top-full z-30 mt-1.5 w-64 overflow-hidden rounded-[14px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] py-1 shadow-[0_18px_38px_-16px_rgba(60,40,25,.35)]"
        >
          <a
            href={shareUrl}
            role="menuitem"
            className="flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-medium text-[var(--soft-ink-soft)] transition-colors hover:bg-[var(--soft-paper-deep)] hover:text-[var(--soft-bordeaux)]"
            data-analytics-event="result_share_clicked"
            data-analytics-surface={surface}
            data-analytics-target={kind}
          >
            <Share2 className="size-4 shrink-0 text-[#6E5BA6]" aria-hidden="true" />
            Поделиться инсайтом — анонимно
          </a>
          <Link
            href={appUrl("/invite")}
            role="menuitem"
            className="flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-medium text-[var(--soft-ink-soft)] transition-colors hover:bg-[var(--soft-paper-deep)] hover:text-[var(--soft-bordeaux)]"
            data-analytics-event="result_gift_clicked"
            data-analytics-surface={surface}
            data-analytics-target={kind}
          >
            <Gift className="size-4 shrink-0 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
            Подарить разбор — получить баллы
          </Link>
        </div>
      )}
    </div>
  );
}
