"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LEGAL_LINKS: { href: string; label: string }[] = [
  { href: "/legal/offer", label: "Оферта" },
  { href: "/legal/privacy", label: "Конфиденциальность" },
  { href: "/legal/cookies", label: "Cookies" },
  { href: "/legal/disclaimer", label: "Дисклеймер" },
  { href: "/legal/ethics", label: "Этический кодекс" },
  { href: "/about", label: "О проекте" },
];

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="soft-clarity-page min-h-screen">
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
        <p className="soft-eyebrow mb-4 text-center">правовая информация</p>
        <nav className="mb-8 flex flex-wrap justify-center gap-2" aria-label="Правовые документы">
          {LEGAL_LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`soft-chip text-xs ${active ? "soft-chip-warm" : ""}`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="soft-card p-6 sm:p-8 md:p-10">{children}</div>
      </div>
    </div>
  );
}
