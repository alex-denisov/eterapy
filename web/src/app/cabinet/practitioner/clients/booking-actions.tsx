"use client";

import { useState } from "react";
import { toast } from "sonner";

export function BookingActions({ bookingId, compact = false }: { bookingId: string; compact?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function updateStatus(status: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (data.booking) {
        setDone(status);
        toast.success(status === "CONFIRMED" ? "Запись подтверждена" : status === "COMPLETED" ? "Завершено" : "Обновлено");
      } else {
        toast.error(data.error || "Ошибка");
      }
    } catch { toast.error("Ошибка сети"); }
    finally { setLoading(false); }
  }

  if (done === "CONFIRMED" && !compact) return <span className="text-xs text-green-400">✓ Подтверждено</span>;
  if (done === "COMPLETED") return <span className="text-xs text-primary">✓ Завершено</span>;
  if (done === "CANCELLED") return <span className="text-xs text-muted-foreground">Отменено</span>;

  if (compact) {
    return (
      <button onClick={() => updateStatus("COMPLETED")} disabled={loading}
        className="text-xs text-muted-foreground hover:text-primary transition-colors disabled:opacity-50">
        Завершить
      </button>
    );
  }

  return (
    <div className="flex gap-2 shrink-0">
      <button onClick={() => updateStatus("CONFIRMED")} disabled={loading}
        className="rounded-lg border border-green-500/30 px-3 py-1.5 text-xs text-green-400 hover:bg-green-500/10 transition-colors disabled:opacity-50">
        Подтвердить
      </button>
      <button onClick={() => updateStatus("CANCELLED")} disabled={loading}
        className="rounded-lg border border-border/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
        Отклонить
      </button>
    </div>
  );
}
