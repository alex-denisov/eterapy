"use client";

import { usePathname } from "next/navigation";
import { Footer } from "./footer";

// Маршруты где footer не нужен (кабинеты, инструменты для авторизованных, видеосессии)
const HIDDEN_PREFIXES = ["/cabinet", "/admin", "/session"];

export function FooterConditional() {
  const pathname = usePathname();
  const hide = HIDDEN_PREFIXES.some((p) => pathname.startsWith(p));
  if (hide) return null;
  const softPublicFooter = pathname === "/" || pathname.startsWith("/all-modalities/checkin") || pathname.startsWith("/products");
  return <Footer variant={softPublicFooter ? "soft" : "dark"} />;
}
