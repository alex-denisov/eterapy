"use client";

import { usePathname } from "next/navigation";
import { Footer } from "./footer";

const HIDDEN_PREFIXES = ["/admin", "/session"];

const SOFT_PREFIXES = [
  "/",
  "/about",
  "/all-modalities",
  "/auth",
  "/cabinet",
  "/checkin",
  "/experts",
  "/help",
  "/how-it-works",
  "/how-to-choose",
  "/legal",
  "/library",
  "/login",
  "/modalities",
  "/pricing",
  "/products",
  "/practitioner",
  "/practitioners",
  "/register",
  "/share",
  "/specialists",
  "/tools",
];

export function FooterConditional() {
  const pathname = usePathname();
  const hide = HIDDEN_PREFIXES.some((p) => pathname.startsWith(p));
  if (hide) return null;

  const isSoft = SOFT_PREFIXES.some((prefix) => (
    prefix === "/" ? pathname === "/" : pathname === prefix || pathname.startsWith(`${prefix}/`)
  ));
  return <Footer variant={isSoft ? "soft" : "dark"} />;
}
