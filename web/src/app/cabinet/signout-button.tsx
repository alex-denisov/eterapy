"use client";

import { logoutUrl } from "@/lib/subdomain";

export function SignOutButton() {
  return (
    <button
      className="soft-button soft-button-ghost text-sm"
      style={{ color: "var(--soft-ink-soft)" }}
      onClick={() => { window.location.href = logoutUrl(); }}
    >
      Выйти
    </button>
  );
}
