"use client";

import { useEffect } from "react";
import { loadMaxSdk } from "@/lib/miniapp/max/client";

export function MiniAppMaxBootstrap({ onGuestName }: { onGuestName: (name: string) => void }) {
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const max = await loadMaxSdk();
        if (cancelled || !max) return;
        const name = max.initDataUnsafe?.user?.first_name?.trim();
        if (name) onGuestName(name);
      } catch {
        // graceful fallback if SDK load fails
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [onGuestName]);

  return null;
}
