"use client";

import { useEffect } from "react";
import { signIn } from "next-auth/react";
import { loadTelegramSdk } from "@/lib/miniapp/telegram/client";

export function MiniAppTelegramBootstrap({ authenticated, onGuestName }: {
  authenticated: boolean;
  onGuestName: (name: string) => void;
}) {
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const telegram = await loadTelegramSdk();
        if (cancelled || !telegram?.initData) return;
        const name = telegram.initDataUnsafe?.user?.first_name?.trim();
        if (name) onGuestName(name);

        // Linking an identity is always an explicit user action on the account
        // screen. Bootstrap only restores a previously linked guest session.
        if (authenticated) return;

        const response = await fetch("/api/miniapp/auth/telegram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData: telegram.initData }),
          cache: "no-store",
        });
        if (cancelled || !response.ok) return;
        const payload = await response.json() as { status?: string; grant?: string; firstName?: string };
        if (payload.firstName) onGuestName(payload.firstName);
        if (payload.status !== "linked" || !payload.grant) return;
        const result = await signIn("credentials", { telegramGrant: payload.grant, redirect: false });
        if (!cancelled && !result?.error) window.location.reload();
      } catch {
        // The browser fallback remains usable when the Telegram SDK or network
        // is unavailable; no signed payload is logged or persisted.
      }
    }

    void bootstrap();
    return () => { cancelled = true; };
  }, [authenticated, onGuestName]);
  return null;
}
