"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Send } from "lucide-react";
import { toast } from "sonner";

// B464 IB5 — the personal referral link with copy-to-clipboard + Telegram share.
// Fetches the stable link from /api/referral/link on mount.
export function InviteLinkCard() {
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/referral/link", { method: "POST" })
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d?.url) setUrl(d.url); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Ссылка скопирована");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Не удалось скопировать");
    }
  }

  const telegramHref = url
    ? `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent("Дарю тебе первый разбор в ETerapy 🤍")}`
    : undefined;

  return (
    <div data-testid="invite-link-card">
      <div className="flex items-center gap-2 rounded-[14px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-2">
        <input
          readOnly
          value={url ?? "готовим вашу ссылку…"}
          aria-label="Ваша ссылка-приглашение"
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none"
          style={{ color: "var(--soft-ink-soft)" }}
          data-testid="invite-link-input"
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copy}
          disabled={!url}
          className="soft-button soft-button-primary disabled:opacity-60"
          data-testid="invite-copy"
        >
          {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
          Скопировать приглашение
        </button>
        <a
          href={telegramHref ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!telegramHref}
          className="soft-button soft-button-ghost"
          data-testid="invite-telegram"
        >
          <Send className="size-4" aria-hidden="true" />
          Telegram
        </a>
      </div>
    </div>
  );
}
