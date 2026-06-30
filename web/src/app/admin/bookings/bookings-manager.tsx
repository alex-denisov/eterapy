"use client";

import { Fragment, useMemo, useState } from "react";
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

export function BookingsManager({ initial }: { initial: AdminBookingRow[] }) {
  const [rows, setRows] = useState(initial);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (!q) return true;
      return [
        row.client.name,
        row.client.email,
        row.practitioner.name,
        row.status,
        sourceLabel(row.source),
        String(row.priceRub),
        String(row.durationMin),
      ].some((value) => value.toLowerCase().includes(q));
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
  }, [query, rows, sortDirection, sortField, status]);

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
    <div className="space-y-3" data-testid="admin-bookings-table">
      <div className="flex flex-wrap items-center gap-2">
        <select
          className={`${COMPACT_SELECT_CLASS} w-48 rounded border border-[var(--soft-paper-edge)]`}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          aria-label="Фильтр статуса бронирования"
        >
          {STATUS_FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <input
          type="search"
          className={`${COMPACT_INPUT_CLASS} ml-auto w-72 rounded border border-[var(--soft-paper-edge)]`}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
          placeholder="Поиск: клиент, email, практик, сумма"
          aria-label="Поиск по бронированиям"
        />
      </div>

      <CompactTableShell minWidth="1120px">
        <thead>
          <tr>
            <CompactHeader label="Создано" sortKey="createdAt" activeSortKey={sortField} direction={sortDirection} onSort={toggleSort} />
            <CompactHeader label="Сессия" sortKey="slotStartAt" activeSortKey={sortField} direction={sortDirection} onSort={toggleSort} />
            <CompactHeader label="Клиент" sortKey="client" activeSortKey={sortField} direction={sortDirection} onSort={toggleSort} />
            <CompactHeader label="Практик" sortKey="practitioner" activeSortKey={sortField} direction={sortDirection} onSort={toggleSort} />
            <CompactHeader label="Статус" sortKey="status" activeSortKey={sortField} direction={sortDirection} onSort={toggleSort} />
            <CompactHeader label="Источник" />
            <CompactHeader label="Сумма / длительность" sortKey="priceRub" activeSortKey={sortField} direction={sortDirection} onSort={toggleSort} />
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
            const isExpanded = expandedId === b.id;
            const commissionLabel = b.commissionPercentApplied === null
              ? "ставка не зафиксирована"
              : `${b.commissionPercentApplied}% комиссия`;
            return (
              <Fragment key={b.id}>
                <tr>
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
                    <button
                      type="button"
                      className="soft-admin-action"
                      data-variant="subtle"
                      onClick={() => setExpandedId(isExpanded ? null : b.id)}
                    >
                      {isExpanded ? "Свернуть" : "Открыть"}
                    </button>
                  </td>
                </tr>
                {isExpanded && (
                  <tr>
                    <td colSpan={8} className={`${COMPACT_CELL_CLASS} border-r-0 bg-[var(--soft-surface)] p-3`}>
                      <div className="space-y-4 text-xs">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div>
                            <p className="text-[var(--soft-ink-faint)]">Клиент</p>
                            <p>{b.client.name}</p>
                            <p className="text-[var(--soft-ink-faint)]">{b.client.email}</p>
                          </div>
                          <div>
                            <p className="text-[var(--soft-ink-faint)]">Практик</p>
                            <p>{b.practitioner.name}</p>
                            {b.referrerPractitionerId && (
                              <p className="text-[var(--soft-ink-faint)]">BYOC referrer: {b.referrerPractitionerId}</p>
                            )}
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
                              className="rounded border border-red-500/30 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                              {pendingId === b.id ? "Отмена..." : "Отменить бронирование"}
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </CompactTableShell>

      {pageCount > 1 && (
        <CompactPaginationBar page={safePage} total={filtered.length} pageSize={PAGE_SIZE} onPage={setPage} />
      )}
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
                      ? "border-[var(--soft-bordeaux)] bg-[var(--soft-apricot)] font-semibold text-[var(--soft-bordeaux)]"
                      : "border-[var(--soft-paper-edge)] text-[var(--soft-ink-soft)] hover:text-[var(--soft-ink)]"
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
            className="rounded-lg bg-[var(--soft-terracotta)] px-3 py-1.5 text-xs font-semibold text-[#fff8f1] transition-colors hover:bg-[var(--soft-terracotta-dark)] disabled:opacity-50"
          >
            {submitting ? "..." : "Подтвердить"}
          </button>
        </div>
      )}
    </div>
  );
}
