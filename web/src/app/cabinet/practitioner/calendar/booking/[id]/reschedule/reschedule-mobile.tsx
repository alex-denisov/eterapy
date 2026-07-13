"use client";

import { useRef, useState } from "react";
import { ArrowRight, Bell, Calendar, ChevronLeft, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { appUrl } from "@/lib/subdomain";

// B466 R9-4 P3 + B481 (owner 2026-07-10) — мобильный «Перенести сессию» 1-в-1 по
// mockup practitioner-calendar-reschedule.html: текущее время → выбор ДНЯ →
// сетка СВОБОДНЫХ слотов (GET /api/slots/available) → наглядная замена
// старое→новое → предложить перенос. Практик предлагает — клиент подтверждает
// (перенос не односторонний). Эндпоинт: POST …/change-requests {type:"RESCHEDULE"}.

const MONTHS_GEN = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

const FMT_TIME = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow",
});

interface Slot {
  startAt: string; // ISO
  endAt: string;
}

// «13 июля, 15:00» из ISO выбранного слота (МСК).
function labelFromIso(iso: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric", month: "numeric", timeZone: "Europe/Moscow",
  }).formatToParts(d);
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const month = Number(parts.find((p) => p.type === "month")?.value ?? "1");
  return `${day} ${MONTHS_GEN[month - 1]}, ${FMT_TIME.format(d)}`;
}

function todayInputValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function RescheduleMobile({
  bookingId,
  practitionerId,
  durationMin,
  clientLabel,
  currentLabel,
  formatLabel,
}: {
  bookingId: string;
  practitionerId: string;
  durationMin: number;
  clientLabel: string;
  currentLabel: string;
  formatLabel: string;
}) {
  const [day, setDay] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedIso, setSelectedIso] = useState("");
  const [busy, setBusy] = useState(false);
  const reqRef = useRef(0);

  // Подгружаем свободные слоты выбранного дня прямо в обработчике выбора (та же
  // логика доступности, что и запись клиента). «Последний ответ побеждает» —
  // reqRef отбрасывает устаревшие ответы при быстрой смене дня.
  async function loadDay(value: string) {
    setDay(value);
    setSelectedIso("");
    if (!value) {
      setSlots([]);
      return;
    }
    const reqId = ++reqRef.current;
    setLoadingSlots(true);
    try {
      const r = await fetch(
        `/api/slots/available?practitionerId=${practitionerId}&date=${value}&durationMin=${durationMin}`,
      );
      const d = await r.json().catch(() => ({}));
      if (reqRef.current !== reqId) return; // устаревший ответ
      setSlots(Array.isArray(d?.slots) ? d.slots : []);
    } catch {
      if (reqRef.current === reqId) setSlots([]);
    } finally {
      if (reqRef.current === reqId) setLoadingSlots(false);
    }
  }

  const newLabel = selectedIso ? labelFromIso(selectedIso) : "";

  async function submit() {
    if (!selectedIso) {
      toast.error("Выберите свободный слот");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/change-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "RESCHEDULE", proposedStartAt: selectedIso, reason: "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Не удалось отправить запрос");
      toast.success("Предложение отправлено клиенту");
      window.location.href = `/cabinet/practitioner/calendar/booking/${bookingId}`;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось отправить запрос");
      setBusy(false);
    }
  }

  return (
    <div className="pcab-screen md:hidden" data-pcab-top data-testid="practitioner-reschedule-mobile">
      <div className="pcab-topbar">
        <Link
          href={appUrl(`/practitioner/calendar/booking/${bookingId}`)}
          className="pcab-roundbtn"
          aria-label="Назад"
        >
          <ChevronLeft width={19} height={19} aria-hidden="true" />
        </Link>
        <span className="pcab-topbar-title">Перенести сессию</span>
        <span className="pcab-topbar-spacer" />
      </div>

      <div className="pcab-flabel">Текущее время</div>
      <div className="pcab-current">
        <div className="pcab-current-ic" aria-hidden="true">
          <Calendar width={19} height={19} strokeWidth={1.7} />
        </div>
        <div>
          <div className="pcab-current-t">{currentLabel}</div>
          <div className="pcab-current-s">{clientLabel} · {formatLabel}</div>
        </div>
      </div>

      <div className="pcab-flabel">День</div>
      <label className="pcab-fieldinput" data-testid="reschedule-day">
        <span className="ic" aria-hidden="true">
          <Calendar width={18} height={18} strokeWidth={1.7} />
        </span>
        <input
          type="date"
          value={day}
          min={todayInputValue()}
          onChange={(e) => loadDay(e.target.value)}
          aria-label="День новой сессии"
          required
        />
        <span className="chev" aria-hidden="true">
          <ChevronRight width={18} height={18} />
        </span>
      </label>

      {/* Свободные слоты выбранного дня */}
      {day && (
        <>
          <div className="pcab-flabel">Свободное время</div>
          {loadingSlots ? (
            <div className="pcab-slots-note" data-testid="reschedule-slots-loading">
              <Loader2 width={13} height={13} className="animate-spin" style={{ display: "inline", verticalAlign: "-2px", marginRight: 6 }} aria-hidden="true" />
              Загружаем свободные слоты…
            </div>
          ) : slots.length === 0 ? (
            <div className="pcab-slots-note" data-testid="reschedule-slots-empty">
              В этот день свободных слотов нет. Выберите другой день или измените рабочие часы в «Доступности».
            </div>
          ) : (
            <div className="pcab-slots" data-testid="reschedule-slots">
              {slots.map((s) => (
                <button
                  key={s.startAt}
                  type="button"
                  className={`pcab-slot${selectedIso === s.startAt ? " active" : ""}`}
                  onClick={() => setSelectedIso(s.startAt)}
                  aria-pressed={selectedIso === s.startAt}
                >
                  {FMT_TIME.format(new Date(s.startAt))}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {newLabel && (
        <div className="pcab-changearrow" data-testid="reschedule-preview">
          <span className="old">{currentLabel}</span>
          <ArrowRight width={18} height={18} strokeWidth={2} style={{ color: "var(--pc-ink-faint)" }} aria-hidden="true" />
          <span className="new">{newLabel}</span>
        </div>
      )}

      <button
        type="button"
        className="pcab-btn block pcab-btn-primary"
        style={{ marginTop: 18 }}
        onClick={submit}
        disabled={busy || !selectedIso}
        data-testid="reschedule-submit"
      >
        {busy ? <Loader2 width={16} height={16} className="animate-spin" aria-hidden="true" /> : <RefreshCw width={16} height={16} strokeWidth={2} aria-hidden="true" />}
        Предложить перенос
      </button>
      <div className="pcab-sendnote calm">
        <Bell width={15} height={15} strokeWidth={1.9} aria-hidden="true" />
        Клиент получит уведомление и подтвердит новое время. До подтверждения сессия остаётся в старом времени.
        Перенос за сутки и раньше — без штрафа.
      </div>
    </div>
  );
}
