"use client";

import { usePathname } from "next/navigation";
import { Footer } from "./footer";
import { useMiniApp } from "@/components/miniapp-provider";

const HIDDEN_PREFIXES = ["/admin", "/session", "/miniapp"];

export function FooterConditional() {
  const pathname = usePathname();
  const { isMiniApp } = useMiniApp();
  // B381: messenger mini-apps get the lean layout — no site footer. The
  // pre-paint CSS (data-miniapp) hides it before this unmount lands.
  if (isMiniApp) return null;
  const hide = HIDDEN_PREFIXES.some((p) => pathname.startsWith(p));
  if (hide) return null;

  // B395: individual product/service pages are single-screen tools — give them
  // the slim footer so it no longer eats the whole mobile screen. The rich
  // 4-column footer stays on the landing and the catalogue.
  const compact = /^\/products\/[^/]+/.test(pathname);

  return <Footer variant="soft" compact={compact} />;
}
