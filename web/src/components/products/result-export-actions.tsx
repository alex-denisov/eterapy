"use client";

import { useState } from "react";
import { Check, Download, Share2 } from "lucide-react";
import { mainUrl } from "@/lib/subdomain";

// B512 R1-1 — действия готового результата: «Скачать PDF» (печатная версия
// /products/print/<id>; ссылка ОБЯЗАНА идти через mainUrl — на app-поддомене
// путь переписался бы в /cabinet/** и давал 404) и «Поделиться» (native
// share-sheet со ссылкой на этот разбор; fallback — копирование в буфер).
// «Скачать текстом» убран по owner-решению 2026-07-15.
export function ResultExportActions({
  resultId,
  title,
  shareUrl,
  className,
}: {
  resultId: string;
  title: string;
  /** Absolute URL to share; defaults to the current page URL (with ?reading=). */
  shareUrl?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const url = shareUrl ?? (typeof window !== "undefined" ? window.location.href : "");
    if (!url) return;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // user dismissed the sheet or share failed — fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // clipboard unavailable — nothing else to do
    }
  }

  return (
    <div className={`flex flex-wrap gap-3 ${className ?? ""}`} data-testid="result-export-actions">
      <a
        href={mainUrl(`/products/print/${resultId}`)}
        target="_blank"
        rel="noopener noreferrer"
        className="soft-button soft-button-ghost inline-flex"
        data-testid="result-download-pdf"
      >
        <Download className="size-4" aria-hidden="true" />
        Скачать PDF
      </a>
      <button
        type="button"
        onClick={() => void handleShare()}
        className="soft-button soft-button-ghost inline-flex"
        data-testid="result-share-link"
      >
        {copied ? <Check className="size-4" aria-hidden="true" /> : <Share2 className="size-4" aria-hidden="true" />}
        {copied ? "Ссылка скопирована" : "Поделиться"}
      </button>
    </div>
  );
}
