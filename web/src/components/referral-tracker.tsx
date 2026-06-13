"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { track } from "@/lib/analytics";
import { SHARE_EVENTS } from "@/lib/share";
import { deepLinkToPath, getMiniAppStartParam, parseMiniAppDeepLink } from "@/lib/miniapp";

const REF_KEY = "eterapy:ref";

/** Прочитать источник реферала, сохранённый при открытии шеринга/deep-link. */
export function consumeReferralSource(): string | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage.getItem(REF_KEY);
  } catch {
    return null;
  }
}

// B390 (M26): монтируется в корневом layout. На входе по шеринг-ссылке или
// TG deep-link — стреляет share_opened, запоминает источник (для
// referred_dialogue_started) и, если это deep-link на карточку, ведёт на неё.
export function ReferralTracker() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    try {
      const { search, hash } = window.location;
      const ref = new URLSearchParams(search).get("ref");
      const startParam = getMiniAppStartParam({ search, hash });
      const deepLink = parseMiniAppDeepLink(startParam);
      const source = ref ?? (deepLink ? "deeplink" : null);
      if (!source) return;

      window.sessionStorage.setItem(REF_KEY, source);
      track({
        event: SHARE_EVENTS.opened,
        surface: deepLink?.kind ?? "web",
        properties: { source, startParam: startParam ?? undefined },
      });

      const target = deepLinkToPath(deepLink);
      if (target && pathname !== target) {
        router.replace(target);
      }
    } catch {
      // best-effort
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
