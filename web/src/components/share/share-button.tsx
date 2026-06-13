"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";
import { track } from "@/lib/analytics";
import { SHARE_EVENTS, shareText, type ShareArtifactKind } from "@/lib/share";

// B390 (M26): переиспользуемая кнопка шеринга артефакта. Стреляет share_generated
// (KPI вирусной петли), затем native share или копирование в буфер.
export function ShareButton({
  kind,
  headline,
  url,
  surface,
  label = "Поделиться",
  className = "soft-button soft-button-ghost",
}: {
  kind: ShareArtifactKind;
  headline: string;
  url: string;
  surface: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    track({ event: SHARE_EVENTS.generated, surface, properties: { kind } });
    const text = shareText(kind, headline);
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: "ETerapy", text, url });
        return;
      }
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(`${text} ${url}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2200);
      }
    } catch {
      // отмена шеринга пользователем — не ошибка
    }
  }

  return (
    <button type="button" onClick={handleShare} className={className} data-testid="share-button">
      {copied ? <Check className="size-4" aria-hidden="true" /> : <Share2 className="size-4" aria-hidden="true" />}
      {copied ? "Скопировано" : label}
    </button>
  );
}
