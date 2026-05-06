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

  return (
    <div className="soft-email-banner px-4 py-2.5">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm">
          <span>⚠</span>
          <span>
            Подтвердите email <strong>{session.user?.email}</strong> —
            проверьте входящие письма.
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <button
            onClick={resend}
            disabled={sending}
            className="text-xs underline disabled:opacity-60"
          >
            {sending ? "Отправляем..." : "Отправить повторно"}
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="text-sm opacity-60 hover:opacity-100"
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
