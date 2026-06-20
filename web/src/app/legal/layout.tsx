"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LEGAL_DOCUMENTS } from "@/lib/legal/registry";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="soft-clarity-page min-h-screen">
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
        <p className="soft-eyebrow mb-4 text-center">правовая информация</p>
        <nav className="mb-8 flex flex-wrap justify-center gap-2" aria-label="Правовые документы">
          {LEGAL_DOCUMENTS.map((doc) => {
            const href = `/legal/${doc.slug}`;
            const active = pathname === href;
            return (
              <Link
                key={doc.slug}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`soft-chip text-xs ${active ? "soft-chip-warm" : ""}`}
              >
                {doc.navLabel}
              </Link>
            );
          })}
          <Link href="/about" className="soft-chip text-xs">О проекте</Link>
        </nav>
        <div className="soft-card p-6 sm:p-8 md:p-10">{children}</div>
      </div>
    </div>
  );
}
