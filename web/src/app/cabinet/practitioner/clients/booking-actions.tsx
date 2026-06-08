"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

const START_WINDOW_MS = 5 * 60 * 1000; // "Начать" opens 5 min before scheduled start

function completionAvailable(sessionStartedAt?: string | null, durationMinutes?: number) {
  if (!sessionStartedAt || !durationMinutes) return true;
  const startedAt = new Date(sessionStartedAt).getTime();
  const required = durationMinutes * 0.75 * 60 * 1000;
  return Date.now() - startedAt >= required;
}

function startWindowOpen(scheduledStartAt?: string | null) {
  if (!scheduledStartAt) return true;
  return Date.now() >= new Date(scheduledStartAt).getTime() - START_WINDOW_MS;
}

export function BookingActions({
  bookingId,
  compact = false,
  status,
  sessionStartedAt,
  scheduledStartAt,
  durationMinutes,
}: {
  bookingId: string;
  compact?: boolean;
  status?: string;
  sessionStartedAt?: string | null;
  scheduledStartAt?: string | null;
  durationMinutes?: number;
}) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => {
      setNowTick((value) => value + 1);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const canComplete = nowTick >= 0 && completionAvailable(sessionStartedAt, durationMinutes);
  const canStart = nowTick >= 0 && startWindowOpen(scheduledStartAt);

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
        router.refresh();
      } else {
        toast.error(data.error || "Ошибка");
      }
    } catch { toast.error("Ошибка сети"); }
    finally { setLoading(false); }
  }

  if (done === "CONFIRMED" && !compact) return <span className="text-xs text-green-400">✓ Подтверждено</span>;
  if (done === "COMPLETED") return <span className="text-xs text-[var(--soft-bordeaux)]">✓ Завершено</span>;
  if (done === "CANCELLED") return <span className="text-xs text-[var(--soft-ink-soft)]">Отменено</span>;

  if (compact) {
    // Баг 13: a single session link (no Видеочат/Начать duplication); "Начать"
    // only inside the 5-min pre-start window; "Завершить" only once the session
    // is actually IN_PROGRESS (started at its scheduled time).
    return (
      <div className="flex gap-2 items-center">
        {status === "IN_PROGRESS" && (
          <>
            <a href={`/session/${bookingId}`}
              className="text-xs text-[var(--soft-bordeaux)] hover:underline">
              В сессию →
            </a>
            <button
              onClick={() => updateStatus("COMPLETED")}
              disabled={loading || !canComplete}
              title={!canComplete ? "Сессию можно завершить после 75% времени" : undefined}
              className="text-xs text-[var(--soft-ink-soft)] hover:text-[var(--soft-bordeaux)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Завершить
            </button>
          </>
        )}
        {status === "CONFIRMED" && (
          canStart ? (
            <a href={`/session/${bookingId}`}
              className="text-xs text-[var(--soft-bordeaux)] hover:underline">
              Начать →
            </a>
          ) : (
            <span className="text-xs text-[var(--soft-ink-faint)]">
              Старт за 5 мин до начала
            </span>
          )
        )}
      </div>
    );
  }

  return (
    <div className="flex gap-2 shrink-0 flex-wrap">
      <button onClick={() => updateStatus("CONFIRMED")} disabled={loading}
        className="rounded-lg border border-green-500/30 px-3 py-1.5 text-xs text-green-400 hover:bg-green-500/10 transition-colors disabled:opacity-50">
        Подтвердить
      </button>
      <button onClick={() => updateStatus("CANCELLED")} disabled={loading}
        className="rounded-lg border border-border/40 px-3 py-1.5 text-xs text-[var(--soft-ink-soft)] hover:text-foreground transition-colors disabled:opacity-50">
        Отклонить
      </button>
    </div>
  );
}
