"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";

export function EmailVerificationBanner() {
  const { data: session } = useSession();
  const [sending, setSending] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const pathname = usePathname();

  const emailVerified = session?.user?.emailVerified;

  // Не показываем на auth-страницах
  const isAuthPage = pathname.startsWith("/login") || pathname.startsWith("/register") || pathname.startsWith("/auth/");

  if (!session || emailVerified || dismissed || isAuthPage) return null;

  async function resend() {
    setSending(true);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: session!.user!.email }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Письмо отправлено! Проверьте почту.");
      } else {
        toast.error(data.error || "Не удалось отправить");
      }
    } catch {
      toast.error("Ошибка сети");
    } finally {
      setSending(false);
    }
  }

  // W2: full-width banner pinned to the very top (like the impersonation
  // banner), not a constrained centered strip. z-[90] keeps it just below the
  // amber impersonation banner (z-[100]) when both are visible.
  return (
    <div className="soft-email-banner sticky top-0 z-[90] flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2.5 text-center text-sm">
      <span className="flex items-center gap-2">
        <span aria-hidden="true">⚠</span>
        <span>
          Подтвердите email <strong>{session.user?.email}</strong> — проверьте входящие письма.
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-3">
        <button
          onClick={resend}
          disabled={sending}
          className="text-xs underline disabled:opacity-60"
        >
          {sending ? "Отправляем..." : "Отправить повторно"}
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="opacity-60 hover:opacity-100"
          aria-label="Закрыть"
        >
          ✕
        </button>
      </span>
    </div>
  );
}
