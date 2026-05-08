"use client";

import { logoutUrl } from "@/lib/subdomain";

export function PractitionerSignOutButton() {
  return (
    <button
      onClick={() => { window.location.href = logoutUrl(); }}
      className="rounded-lg border border-border/40 px-3 py-1.5 text-sm text-[var(--soft-ink-soft)] hover:text-foreground transition-colors"
    >
      Выйти
    </button>
  );
}
