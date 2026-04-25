"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { getBookingStatus } from "@/lib/booking-status";

export interface AdminBookingRow {
  id: string;
  status: string;
  priceRub: number;
  durationMin: number;
  slotStartAt: string | null;
  createdAt: string;
  client: { name: string; email: string };
  practitioner: { name: string };
}

type SortKey = "createdDesc" | "createdAsc" | "slotDesc" | "slotAsc";

const SORT_LABELS: Record<SortKey, string> = {
  createdDesc: "Создано: новые сверху",
  createdAsc: "Создано: старые сверху",
  slotDesc: "По дате сессии: позже сверху",
  slotAsc: "По дате сессии: раньше сверху",
};

const CANCELLABLE = new Set(["PENDING", "CONFIRMED"]);

export function BookingsManager({ initial }: { initial: AdminBookingRow[] }) {
  const [rows, setRows] = useState(initial);
  const [sort, setSort] = useState<SortKey>("createdDesc");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const cp = [...rows];
    cp.sort((a, b) => {
      switch (sort) {
        case "createdAsc":
          return a.createdAt.localeCompare(b.createdAt);
        case "createdDesc":
          return b.createdAt.localeCompare(a.createdAt);
        case "slotAsc":
          return (a.slotStartAt ?? "").localeCompare(b.slotStartAt ?? "");
        case "slotDesc":
          return (b.slotStartAt ?? "").localeCompare(a.slotStartAt ?? "");
      }
    });
    return cp;
  }, [rows, sort]);

  async function cancelBooking(id: string) {
    if (!confirm("Отменить бронирование? Действие необратимо.")) return;
    setPendingId(id);
    const res = await fetch(`/api/bookings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId: id, status: "CANCELLED" }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: "CANCELLED" } : r)));
      toast.success("Бронирование отменено");
    } else {
      toast.error(body?.error ?? "Не удалось отменить");
    }
    setPendingId(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Сортировка:</span>
        {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
          <button
            key={k}
            onClick={() => setSort(k)}
            className={`rounded-lg px-3 py-1 text-xs transition-colors ${
              sort === k
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {SORT_LABELS[k]}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {sorted.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Нет бронирований</p>
        ) : (
          sorted.map((b) => {
            const st = getBookingStatus(b.status);
            const isExpanded = expandedId === b.id;
            const slot = b.slotStartAt
              ? new Date(b.slotStartAt).toLocaleString("ru-RU", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "Слот не выбран";
            return (
              <div key={b.id} className="rounded-xl border border-border/20 bg-card/20 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : b.id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {b.client.name} → {b.practitioner.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {b.priceRub.toLocaleString("ru-RU")} ₽ · {b.durationMin} мин · {slot} · создано{" "}
                      {new Date(b.createdAt).toLocaleDateString("ru-RU")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge className={st.color}>{st.label}</Badge>
                    <span className="text-xs text-muted-foreground/40">{isExpanded ? "▲" : "▼"}</span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-border/20 px-4 pb-4 pt-3 space-y-3 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <p className="text-muted-foreground">Клиент</p>
                        <p>{b.client.name}</p>
                        <p className="text-muted-foreground">{b.client.email}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Практик</p>
                        <p>{b.practitioner.name}</p>
                      </div>
                    </div>
                    <p className="text-muted-foreground">
                      Reschedule, изменение длительности и переназначение практика — в работе (11.E.2 / 11.E.3).
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {CANCELLABLE.has(b.status) && (
                        <button
                          onClick={() => cancelBooking(b.id)}
                          disabled={pendingId === b.id}
                          className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                        >
                          {pendingId === b.id ? "Отмена..." : "Отменить бронирование"}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
