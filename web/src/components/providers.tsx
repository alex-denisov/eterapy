"use client";

import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";
import { EmailVerificationBanner } from "./email-verification-banner";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <EmailVerificationBanner />
      {children}
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "var(--surface-overlay)",
            border: "1px solid color-mix(in srgb, var(--brand-warm-gold) 22%, transparent)",
            borderRadius: "var(--radius-card)",
            boxShadow: "var(--shadow-surface)",
            color: "var(--text-primary)",
          },
          classNames: {
            success: "!border-[color-mix(in_srgb,var(--signal-success)_45%,transparent)]",
            error: "!border-[color-mix(in_srgb,var(--signal-danger)_45%,transparent)]",
          },
        }}
        richColors
      />
    </SessionProvider>
  );
}
