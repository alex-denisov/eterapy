"use client";

import { usePathname } from "next/navigation";
import { Footer } from "./footer";

// Маршруты где footer не нужен (кабинеты, инструменты для авторизованных)
const HIDDEN_PREFIXES = ["/cabinet", "/admin"];

export function FooterConditional() {
  const pathname = usePathname();
  const hide = HIDDEN_PREFIXES.some((p) => pathname.startsWith(p));
  if (hide) return null;
  return <Footer />;
}
