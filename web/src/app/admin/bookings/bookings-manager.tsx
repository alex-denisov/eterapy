"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, Edit3, X } from "lucide-react";
import { toast } from "sonner";
import {
  CompactHeader,
  CompactPaginationBar,
  CompactTableShell,
  COMPACT_CELL_CLASS,
  COMPACT_INPUT_CLASS,
  COMPACT_SELECT_CLASS,
  type SortDirection,
} from "@/components/admin/compact-table";
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
const PAGE_SIZE = 20;

function todayInputDate() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

type SortField = "createdAt" | "slotStartAt" | "client" | "practitioner" | "status" | "priceRub" | "durationMin";

const STATUS_FILTERS = [
  { value: "all", label: "Все статусы" },
  { value: "PENDING", label: "Ожидает" },
  { value: "CONFIRMED", label: "Подтверждено" },
  { value: "IN_PROGRESS", label: "Идет сессия" },
  { value: "COMPLETED", label: "Завершена" },
  { value: "CANCELLED", label: "Отменена" },
  { value: "DISPUTED", label: "Жалоба" },
  { value: "REFUNDED", label: "Возврат" },
];

const CANCELLABLE = new Set(["PENDING", "CONFIRMED"]);

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

function HeaderTextFilter({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="p-1 pt-0">
      <input
        className={COMPACT_INPUT_CLASS}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export function BookingsManager({ initial }: { initial: AdminBookingRow[] }) {
  const [rows, setRows] = useState(initial);
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<AdminBookingRow | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<AdminBookingRow | null>(null);
  const [filters, setFilters] = useState({
    createdAt: "",
    slotStartAt: "",
    client: "",
    practitioner: "",
    status: "all",
    source: "",
    priceRub: "",
  });

  const filtered = useMemo(() => {
    const list = rows.filter((row) => {
      if (filters.status !== "all" && row.status !== filters.status) return false;
      return [
        [filters.createdAt, formatAdminDateTime(row.createdAt)],
        [filters.slotStartAt, formatAdminDateTime(row.slotStartAt)],
        [filters.client, `${row.client.name} ${row.client.email}`],
        [filters.practitioner, row.practitioner.name],
        [filters.source, sourceLabel(row.source)],
        [filters.priceRub, `${row.priceRub} ${row.durationMin}`],
      ].every(([filter, value]) => !filter || value.toLowerCase().includes(filter.toLowerCase()));
    });
    return [...list].sort((a, b) => {
      let result = 0;
      if (sortField === "client") result = a.client.name.localeCompare(b.client.name, "ru");
      else if (sortField === "practitioner") result = a.practitioner.name.localeCompare(b.practitioner.name, "ru");
      else if (sortField === "status") result = getBookingStatus(a.status).label.localeCompare(getBookingStatus(b.status).label, "ru");
      else if (sortField === "priceRub") result = a.priceRub - b.priceRub;
      else if (sortField === "durationMin") result = a.durationMin - b.durationMin;
      else result = (a[sortField] ?? "").localeCompare(b[sortField] ?? "");
      return sortDirection === "asc" ? result : -result;
    });
  }, [filters, rows, sortDirection, sortField]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function toggleSort(key: string) {
    const field = key as SortField;
    if (field === sortField) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection(field === "createdAt" || field === "slotStartAt" ? "desc" : "asc");
    }
  }

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
      <CompactTableShell minWidth="1120px">
        <thead className="sticky top-0 z-10 bg-[var(--soft-surface)] text-[var(--soft-ink-soft)]">
          <tr>
            <CompactHeader label="Создано" sortKey="createdAt" activeSortKey={sortField} direction={sortDirection} onSort={toggleSort}>
              <HeaderTextFilter value={filters.createdAt} placeholder="дд.мм.гггг" onChange={(value) => { setFilters((current) => ({ ...current, createdAt: value })); setPage(1); }} />
            </CompactHeader>
            <CompactHeader label="Сессия" sortKey="slotStartAt" activeSortKey={sortField} direction={sortDirection} onSort={toggleSort}>
              <HeaderTextFilter value={filters.slotStartAt} placeholder="дд.мм.гггг" onChange={(value) => { setFilters((current) => ({ ...current, slotStartAt: value })); setPage(1); }} />
            </CompactHeader>
            <CompactHeader label="Клиент" sortKey="client" activeSortKey={sortField} direction={sortDirection} onSort={toggleSort}>
              <HeaderTextFilter value={filters.client} placeholder="имя/email" onChange={(value) => { setFilters((current) => ({ ...current, client: value })); setPage(1); }} />
            </CompactHeader>
            <CompactHeader label="Практик" sortKey="practitioner" activeSortKey={sortField} direction={sortDirection} onSort={toggleSort}>
              <HeaderTextFilter value={filters.practitioner} placeholder="практик" onChange={(value) => { setFilters((current) => ({ ...current, practitioner: value })); setPage(1); }} />
            </CompactHeader>
            <CompactHeader label="Статус" sortKey="status" activeSortKey={sortField} direction={sortDirection} onSort={toggleSort}>
              <div className="p-1 pt-0">
                <select
                  className={COMPACT_SELECT_CLASS}
                  value={filters.status}
                  onChange={(event) => { setFilters((current) => ({ ...current, status: event.target.value })); setPage(1); }}
                  aria-label="Фильтр статуса бронирования"
                >
                  {STATUS_FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </div>
            </CompactHeader>
            <CompactHeader label="Источник">
              <HeaderTextFilter value={filters.source} placeholder="источник" onChange={(value) => { setFilters((current) => ({ ...current, source: value })); setPage(1); }} />
            </CompactHeader>
            <CompactHeader label="Сумма / длительность" sortKey="priceRub" activeSortKey={sortField} direction={sortDirection} onSort={toggleSort}>
              <HeaderTextFilter value={filters.priceRub} placeholder="сумма/мин" onChange={(value) => { setFilters((current) => ({ ...current, priceRub: value })); setPage(1); }} />
            </CompactHeader>
            <CompactHeader label="Действия" />
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 ? (
            <tr>
              <td colSpan={8} className={`${COMPACT_CELL_CLASS} py-10 text-center text-sm text-muted-foreground`}>Нет бронирований</td>
            </tr>
          ) : visible.map((b) => {
            const st = getBookingStatus(b.status);
            const commissionLabel = b.commissionPercentApplied === null
              ? "ставка не зафиксирована"
              : `${b.commissionPercentApplied}% комиссия`;
            return (
              <tr key={b.id}>
                <td className={`${COMPACT_CELL_CLASS} whitespace-nowrap`}>{formatAdminDateTime(b.createdAt)}</td>
                <td className={`${COMPACT_CELL_CLASS} whitespace-nowrap`}>{formatAdminDateTime(b.slotStartAt)}</td>
                <td className={COMPACT_CELL_CLASS}>
                  <p className="font-medium text-[var(--soft-ink)]">{b.client.name}</p>
                  <p className="text-[10px] text-[var(--soft-ink-faint)]">{b.client.email}</p>
                </td>
                <td className={COMPACT_CELL_CLASS}>{b.practitioner.name}</td>
                <td className={COMPACT_CELL_CLASS}>
                  <span className={`inline-flex rounded px-2 py-0.5 text-[10px] font-semibold ${st.color}`}>{st.label}</span>
                </td>
                <td className={COMPACT_CELL_CLASS}>
                  <p>{sourceLabel(b.source)}</p>
                  <p className="text-[10px] text-[var(--soft-ink-faint)]">{commissionLabel}</p>
                </td>
                <td className={`${COMPACT_CELL_CLASS} whitespace-nowrap tabular-nums`}>
                  {b.priceRub.toLocaleString("ru-RU")} ₽ · {b.durationMin} мин
                </td>
                <td className={`${COMPACT_CELL_CLASS} border-r-0`}>
                  <div className="soft-admin-table-actions">
                    <button
                      type="button"
                      className="soft-admin-icon-button"
                      onClick={() => setRescheduleTarget(b)}
                      disabled={!CANCELLABLE.has(b.status)}
                      title="Перенести или изменить длительность"
                      aria-label="Перенести или изменить длительность"
                    >
                      <Edit3 className="size-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="soft-admin-icon-button"
                      data-variant="danger"
                      onClick={() => setCancelTarget(b)}
                      disabled={!CANCELLABLE.has(b.status) || pendingId === b.id}
                      title="Отменить бронирование"
                      aria-label="Отменить бронирование"
                    >
                      <Ban className="size-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </CompactTableShell>

      {pageCount > 1 && (
        <CompactPaginationBar page={safePage} total={filtered.length} pageSize={PAGE_SIZE} onPage={setPage} />
      )}
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
