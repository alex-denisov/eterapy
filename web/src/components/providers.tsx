"use client";

import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "#0f2236",
            border: "1px solid rgba(201,168,76,0.2)",
            color: "#f8fafc",
          },
          classNames: {
            success: "!border-green-500/30",
            error: "!border-rose-500/30",
          },
        }}
        richColors
      />
    </SessionProvider>
  );
}
