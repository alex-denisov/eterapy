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
  practitioner: { id: string; name: string };
}

interface AvailableSlot {
  startAt: string;
  endAt: string;
}

const DURATION_CHOICES = [30, 45, 60, 90];

function todayInputDate() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
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
                  <div className="border-t border-border/20 px-4 pb-4 pt-3 space-y-4 text-xs">
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

                    {CANCELLABLE.has(b.status) && (
                      <RescheduleControls
                        booking={b}
                        onApplied={(slot, priceRub, durationMin) => {
                          setRows((prev) =>
                            prev.map((r) =>
                              r.id === b.id
                                ? { ...r, slotStartAt: slot.startAt, priceRub, durationMin }
                                : r,
                            ),
                          );
                        }}
                      />
                    )}

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

                    <p className="text-muted-foreground/60">
                      Переназначение на другого практика — отдельным шагом (11.E.3).
                    </p>
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

interface RescheduleControlsProps {
  booking: AdminBookingRow;
  onApplied: (slot: AvailableSlot, priceRub: number, durationMin: number) => void;
}

function RescheduleControls({ booking, onApplied }: RescheduleControlsProps) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayInputDate());
  const [duration, setDuration] = useState<number>(booking.durationMin || 60);
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<AvailableSlot | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function fetchSlots(d: string, dur: number) {
    setLoading(true);
    setSlots([]);
    setPicked(null);
    const params = new URLSearchParams({
      practitionerId: booking.practitioner.id,
      date: d,
      durationMin: String(dur),
    });
    const res = await fetch(`/api/slots/available?${params}`);
    const json = await res.json().catch(() => ({}));
    setSlots(json.slots ?? []);
    setLoading(false);
  }

  async function applyReschedule() {
    if (!picked) return;
    setSubmitting(true);
    const res = await fetch(`/api/admin/bookings/${booking.id}/reschedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newSlotStartAt: picked.startAt, newSlotEndAt: picked.endAt }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      toast.success(
        `Перенесено на ${new Date(picked.startAt).toLocaleString("ru-RU", {
          day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
        })} · ${json.booking?.priceRub ?? booking.priceRub} ₽`,
      );
      onApplied(picked, json.booking?.priceRub ?? booking.priceRub, duration);
      setOpen(false);
      setPicked(null);
    } else {
      toast.error(json.error ?? "Не удалось перенести");
    }
    setSubmitting(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => {
          setOpen(true);
          fetchSlots(date, duration);
        }}
        className="rounded-lg border border-primary/30 px-3 py-1.5 text-xs text-primary hover:bg-primary/10"
      >
        Перенести / изменить длительность
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-primary">Перенос сессии</p>
        <button onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">
          Закрыть
        </button>
      </div>
      <div className="flex flex-wrap gap-3 items-end">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">Дата</span>
          <input
            type="date"
            value={date}
            min={todayInputDate()}
            onChange={(e) => {
              setDate(e.target.value);
              fetchSlots(e.target.value, duration);
            }}
            className="rounded-lg border border-border/40 bg-card/50 px-2 py-1 text-xs"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">Длительность</span>
          <select
            value={duration}
            onChange={(e) => {
              const next = Number(e.target.value);
              setDuration(next);
              fetchSlots(date, next);
            }}
            className="rounded-lg border border-border/40 bg-card/50 px-2 py-1 text-xs"
          >
            {DURATION_CHOICES.map((d) => (
              <option key={d} value={d}>
                {d} мин
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="space-y-1">
        <p className="text-[11px] text-muted-foreground">
          Свободные окна {booking.practitioner.name} · текущее: {booking.durationMin} мин · {booking.priceRub.toLocaleString("ru-RU")} ₽
        </p>
        {loading ? (
          <p className="text-xs text-muted-foreground/70">Загружаем...</p>
        ) : slots.length === 0 ? (
          <p className="text-xs text-muted-foreground/70">На этот день нет свободных окон.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {slots.map((s) => {
              const isPicked = picked?.startAt === s.startAt;
              const time = new Date(s.startAt).toLocaleTimeString("ru-RU", {
                hour: "2-digit",
                minute: "2-digit",
              });
              return (
                <button
                  key={s.startAt}
                  onClick={() => setPicked(s)}
                  className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                    isPicked
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border/40 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {time}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {picked && (
        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-xs">
            Перенести на{" "}
            <b>
              {new Date(picked.startAt).toLocaleString("ru-RU", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </b>{" "}
            ({duration} мин)
          </p>
          <button
            onClick={applyReschedule}
            disabled={submitting}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-navy disabled:opacity-50"
          >
            {submitting ? "..." : "Подтвердить"}
          </button>
        </div>
      )}
    </div>
  );
}
