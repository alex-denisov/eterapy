"use client";

import type React from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// B395: individual product/service pages are single-screen tools with short
// content. The page used `min-height: 100vh` to cover the dark body with the
// warm gradient, which pushed the footer below the fold. We drop that 100vh (in
// CSS) and instead warm-fill the stretched `main` here (`.soft-product-shell`),
// so the short tool + compact footer both land on the first screen over a
// seamless warm field. Every other route keeps the plain stretched main.
export function AppMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isProductPage = /^\/products\/[^/]+/.test(pathname);
  return <main className={cn("flex-1", isProductPage && "soft-product-shell")}>{children}</main>;
}
