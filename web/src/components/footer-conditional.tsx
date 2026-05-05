"use client";

import { usePathname } from "next/navigation";
import { Footer } from "./footer";

// Маршруты где footer не нужен (кабинеты, инструменты для авторизованных, видеосессии)
const HIDDEN_PREFIXES = ["/cabinet", "/admin", "/session"];

export function FooterConditional() {
  const pathname = usePathname();
  const hide = HIDDEN_PREFIXES.some((p) => pathname.startsWith(p));
  if (hide) return null;
  const softPublicPrefixes = [
    "/",
    "/about",
    "/all-modalities",
    "/experts",
    "/help",
    "/how-it-works",
    "/how-to-choose",
    "/legal",
    "/library",
    "/modalities",
    "/pricing",
    "/products",
    "/practitioner",
    "/practitioners",
    "/share",
    "/specialists",
    "/tools",
  ];
  const softPublicFooter = softPublicPrefixes.some((prefix) => (
    prefix === "/" ? pathname === "/" : pathname === prefix || pathname.startsWith(`${prefix}/`)
  ));
  return <Footer variant={softPublicFooter ? "soft" : "dark"} />;
}
