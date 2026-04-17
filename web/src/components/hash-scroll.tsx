"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

function scrollToHash(hash: string) {
  if (!hash) return;
  const id = decodeURIComponent(hash.startsWith("#") ? hash.slice(1) : hash);
  if (!id) return;

  const tryScroll = () => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      return true;
    }
    return false;
  };

  if (tryScroll()) return;

  let attempts = 0;
  const interval = window.setInterval(() => {
    attempts += 1;
    if (tryScroll() || attempts > 20) {
      window.clearInterval(interval);
    }
  }, 50);
}

export function HashScroll() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.location.hash) return;
    const hash = window.location.hash;
    const raf = window.requestAnimationFrame(() => scrollToHash(hash));
    return () => window.cancelAnimationFrame(raf);
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onHashChange = () => scrollToHash(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return null;
}
