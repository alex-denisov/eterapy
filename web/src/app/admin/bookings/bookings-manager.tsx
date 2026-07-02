"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { AdminCompactDataTable, type AdminCompactColumn } from "@/components/admin/compact-client-table";
import { getBookingStatus } from "@/lib/booking-status";

export interface AdminBookingRow {
  id: string;
  status: string;
  source: string;
  commissionPercentApplied: number | null;
  referrerPractitionerId: string | null;
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

const STATUS_FILTERS = [
  { value: "PENDING", label: "Ожидает" },
  { value: "CONFIRMED", label: "Подтверждено" },
  { value: "IN_PROGRESS", label: "Идет сессия" },
  { value: "COMPLETED", label: "Завершена" },
  { value: "CANCELLED", label: "Отменена" },
  { value: "DISPUTED", label: "Жалоба" },
  { value: "REFUNDED", label: "Возврат" },
];

const CANCELLABLE = new Set(["PENDING", "CONFIRMED"]);

const bookingColumns: AdminCompactColumn[] = [
  { key: "createdAt", label: "Создано", sortable: true, filterKind: "date" },
  { key: "slotStartAt", label: "Сессия", sortable: true, filterKind: "date" },
  { key: "client", label: "Клиент", sortable: true },
  { key: "practitioner", label: "Практик", sortable: true },
  {
    key: "status",
    label: "Статус",
    sortable: true,
    filterKind: "select",
    options: STATUS_FILTERS,
  },
  { key: "source", label: "Источник", sortable: true },
  { key: "amount", label: "Сумма / длительность", sortable: true, align: "right" },
  { key: "actions", label: "Действия", filterKind: "none", align: "center" },
];

function formatAdminDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

function sourceLabel(source: string) {
  return source === "BYOC" ? "BYOC" : "Платформа";
}

export function BookingsManager({ initial }: { initial: AdminBookingRow[] }) {
  const [rows, setRows] = useState(initial);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<AdminBookingRow | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<AdminBookingRow | null>(null);

  async function cancelBooking(id: string) {
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
      setCancelTarget(null);
    } else {
      toast.error(body?.error ?? "Не удалось отменить");
    }
    setPendingId(null);
  }

  return (
    <div className="space-y-3" data-testid="admin-bookings-table">
      <AdminCompactDataTable
        columns={bookingColumns}
        rows={rows.map((booking) => {
          const status = getBookingStatus(booking.status);
          const commissionLabel = booking.commissionPercentApplied === null
            ? "ставка не зафиксирована"
            : `${booking.commissionPercentApplied}% комиссия`;
          const canEdit = CANCELLABLE.has(booking.status);
          return {
            id: booking.id,
            cells: {
              createdAt: {
                value: formatAdminDateTime(booking.createdAt),
                sortValue: new Date(booking.createdAt).getTime(),
                filterValue: formatAdminDateTime(booking.createdAt),
              },
              slotStartAt: {
                value: formatAdminDateTime(booking.slotStartAt),
                sortValue: booking.slotStartAt ? new Date(booking.slotStartAt).getTime() : -1,
                filterValue: formatAdminDateTime(booking.slotStartAt),
              },
              client: {
                value: booking.client.name,
                subvalue: booking.client.email,
                filterValue: `${booking.client.name} ${booking.client.email}`,
              },
              practitioner: booking.practitioner.name,
              status: {
                kind: "status",
                label: status.label,
                tone: booking.status === "CANCELLED" || booking.status === "REFUNDED" ? "danger" : booking.status === "COMPLETED" ? "ok" : "warn",
                filterValue: `${booking.status} ${status.label}`,
              },
              source: {
                value: sourceLabel(booking.source),
                subvalue: commissionLabel,
                filterValue: `${sourceLabel(booking.source)} ${commissionLabel}`,
              },
              amount: {
                value: `${booking.priceRub.toLocaleString("ru-RU")} ₽ · ${booking.durationMin} мин`,
                sortValue: booking.priceRub,
                filterValue: `${booking.priceRub} ${booking.durationMin}`,
              },
              actions: {
                kind: "actions",
                actions: [
                  {
                    label: "Перенести или изменить длительность",
                    icon: "edit",
                    onClick: () => setRescheduleTarget(booking),
                    disabled: !canEdit,
                  },
                  {
                    label: "Отменить бронирование",
                    icon: "cancel",
                    variant: "danger",
                    onClick: () => setCancelTarget(booking),
                    disabled: !canEdit || pendingId === booking.id,
                  },
                ],
              },
            },
          };
        })}
        empty="Нет бронирований"
        minWidth="1240px"
      />
      {cancelTarget ? (
        <ConfirmCancelModal
          booking={cancelTarget}
          pending={pendingId === cancelTarget.id}
          onClose={() => setCancelTarget(null)}
          onConfirm={() => cancelBooking(cancelTarget.id)}
        />
      ) : null}
      {rescheduleTarget ? (
        <RescheduleControls
          booking={rescheduleTarget}
          onClose={() => setRescheduleTarget(null)}
          onApplied={(slot, priceRub, durationMin) => {
            setRows((prev) =>
              prev.map((r) =>
                r.id === rescheduleTarget.id
                  ? { ...r, slotStartAt: slot.startAt, priceRub, durationMin }
                  : r,
              ),
            );
            setRescheduleTarget(null);
          }}
        />
      ) : null}
    </div>
  );
}

interface RescheduleControlsProps {
  booking: AdminBookingRow;
  onClose: () => void;
  onApplied: (slot: AvailableSlot, priceRub: number, durationMin: number) => void;
}

function RescheduleControls({ booking, onClose, onApplied }: RescheduleControlsProps) {
  const [date, setDate] = useState(todayInputDate());
  const [duration, setDuration] = useState<number>(booking.durationMin || 60);
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<AvailableSlot | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchSlots = useCallback(async (d: string, dur: number) => {
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
  }, [booking.practitioner.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchSlots(date, duration);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [date, duration, fetchSlots]);

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
      setPicked(null);
    } else {
      toast.error(json.error ?? "Не удалось перенести");
    }
    setSubmitting(false);
  }

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/35 p-4">
      <div className="w-full max-w-lg rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4 shadow-[var(--soft-shadow-lg)]">
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <h3 className="font-heading text-xl font-semibold text-[var(--soft-bordeaux)]">Перенос сессии</h3>
            <p className="text-xs text-[var(--soft-ink-soft)]">{booking.client.name} · {booking.practitioner.name}</p>
          </div>
          <button type="button" className="soft-admin-icon-button" onClick={onClose} aria-label="Закрыть">
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--soft-ink-soft)]">
            Дата
            <input
              type="date"
              value={date}
              min={todayInputDate()}
              onChange={(event) => {
                setDate(event.target.value);
              }}
              className="h-8 rounded border border-[var(--soft-paper-edge)] bg-white px-2 text-xs"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--soft-ink-soft)]">
            Длительность
            <select
              value={duration}
              onChange={(event) => {
                const next = Number(event.target.value);
                setDuration(next);
              }}
              className="h-8 rounded border border-[var(--soft-paper-edge)] bg-white px-2 text-xs"
            >
              {DURATION_CHOICES.map((choice) => <option key={choice} value={choice}>{choice} мин</option>)}
            </select>
          </label>
        </div>
        <div className="mt-3 space-y-2">
          <p className="text-[11px] text-[var(--soft-ink-faint)]">
            Свободные окна {booking.practitioner.name} · текущее: {booking.durationMin} мин · {booking.priceRub.toLocaleString("ru-RU")} ₽
          </p>
          {loading ? (
            <p className="text-xs text-[var(--soft-ink-soft)]">Загружаем...</p>
          ) : slots.length === 0 ? (
            <p className="text-xs text-[var(--soft-ink-soft)]">На этот день нет свободных окон.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {slots.map((slot) => {
                const isPicked = picked?.startAt === slot.startAt;
                const time = new Date(slot.startAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
                return (
                  <button
                    key={slot.startAt}
                    type="button"
                    onClick={() => setPicked(slot)}
                    className={`rounded-md border px-2 py-1 text-xs transition-colors ${isPicked ? "border-[var(--soft-bordeaux)] bg-[var(--soft-apricot)] font-semibold text-[var(--soft-bordeaux)]" : "border-[var(--soft-paper-edge)] text-[var(--soft-ink-soft)] hover:text-[var(--soft-ink)]"}`}
                  >
                    {time}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-[var(--soft-ink-soft)]">
            {picked ? `Выбрано: ${new Date(picked.startAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · ${duration} мин` : "Выберите свободное окно"}
          </p>
          <div className="flex gap-2">
            <button type="button" className="soft-admin-action" data-variant="subtle" onClick={onClose}>Отмена</button>
            <button type="button" className="soft-admin-action" data-variant="primary" onClick={applyReschedule} disabled={!picked || submitting}>
              {submitting ? "Сохраняем..." : "Подтвердить"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfirmCancelModal({
  booking,
  pending,
  onClose,
  onConfirm,
}: {
  booking: AdminBookingRow;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/35 p-4">
      <div className="w-full max-w-sm rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4 shadow-[var(--soft-shadow-lg)]">
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <h3 className="font-heading text-xl font-semibold text-[var(--soft-bordeaux)]">Отменить бронирование?</h3>
            <p className="mt-1 text-xs text-[var(--soft-ink-soft)]">{booking.client.name} · {formatAdminDateTime(booking.slotStartAt)}</p>
          </div>
          <button type="button" className="soft-admin-icon-button" onClick={onClose} aria-label="Закрыть">
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </div>
        <p className="text-sm text-[var(--soft-ink-soft)]">Действие изменит статус бронирования на “Отменено”.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="soft-admin-action" data-variant="subtle" onClick={onClose}>Не отменять</button>
          <button type="button" className="soft-admin-action" data-variant="danger" onClick={onConfirm} disabled={pending}>
            {pending ? "Отменяем..." : "Отменить"}
          </button>
        </div>
      </div>
    </div>
  );
}
