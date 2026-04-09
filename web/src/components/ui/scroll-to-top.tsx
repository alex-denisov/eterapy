"use client";

import { useState, useEffect } from "react";
import { ArrowUp } from "lucide-react";

export function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setVisible(window.scrollY > 400);
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="fixed bottom-24 right-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-navy shadow-lg hover:bg-primary/90 transition-all md:bottom-8"
      aria-label="Наверх"
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
}
