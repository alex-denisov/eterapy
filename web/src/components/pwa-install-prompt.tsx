"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DISMISSED_KEY = "eterapy:pwa-install-dismissed";

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function PWAInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone() || window.localStorage.getItem(DISMISSED_KEY) === "1") return;

    // "Install the app" only makes sense for client-facing surfaces. In the
    // admin/superadmin cabinet (desktop staff) and paid product funnel the banner
    // is irrelevant, and because we call preventDefault() Chrome logs an
    // informational "Banner not shown: …preventDefault() called" notice there.
    // Skip those areas entirely so we never intercept the event where it isn't wanted.
    const host = window.location.hostname;
    const path = window.location.pathname;
    if (host.startsWith("admin.") || path.startsWith("/admin") || path.startsWith("/products")) return;

    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setVisible(true);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  if (!visible || !installEvent) return null;

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice.catch(() => ({ outcome: "dismissed" as const, platform: "unknown" }));
    window.dispatchEvent(new CustomEvent("eterapy:analytics", {
      detail: {
        event: "pwa_install_prompt_closed",
        surface: "pwa",
        outcome: choice.outcome,
        platform: choice.platform,
      },
    }));
    setVisible(false);
    setInstallEvent(null);
  }

  function dismiss() {
    window.localStorage.setItem(DISMISSED_KEY, "1");
    window.dispatchEvent(new CustomEvent("eterapy:analytics", {
      detail: { event: "pwa_install_prompt_closed", surface: "pwa", outcome: "dismissed", platform: "manual" },
    }));
    setVisible(false);
  }

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center gap-3 rounded-[14px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper)] p-3 shadow-[0_18px_50px_rgba(62,43,46,0.18)] md:hidden" data-testid="pwa-install-prompt">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[var(--soft-bordeaux)]">ETerapy на главный экран</p>
        <p className="mt-0.5 text-xs leading-relaxed text-[var(--soft-ink-soft)]">Быстрый вход к карте, практике и отчетам.</p>
      </div>
      <button type="button" onClick={install} className="soft-button soft-button-primary !px-3 !py-2" aria-label="Установить приложение">
        <Download className="size-4" aria-hidden="true" />
      </button>
      <button type="button" onClick={dismiss} className="soft-chip !px-2 !py-2" aria-label="Скрыть">
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
