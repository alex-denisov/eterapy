"use client";

import { useState } from "react";
import { ArrowRight, Bell, Calendar, ChevronLeft, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { appUrl } from "@/lib/subdomain";

// B466 R9-4 P3 — мобильный «Перенести сессию» 1-в-1 по mockup
// practitioner-calendar-reschedule.html: текущее время → новое время
// (нативный пикер) → наглядная замена старое→новое → предложить перенос.
// Тот же эндпоинт, что и десктоп: POST …/change-requests {type:"RESCHEDULE"}.
// Практик предлагает — клиент подтверждает (перенос не односторонний).

const MONTHS_GEN = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

// «13 июля, 15:00» из значения datetime-local (без tz-путаницы — показываем
// ровно выбранное настенное время; на сервер уходит toISOString(), как в десктопе).
function labelFromInput(value: string): string {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return "";
  const [, , mo, d, h, mi] = m;
  return `${Number(d)} ${MONTHS_GEN[Number(mo) - 1]}, ${h}:${mi}`;
}

export function RescheduleMobile({
  bookingId,
  clientLabel,
  currentLabel,
}: {
  bookingId: string;
  clientLabel: string;
  currentLabel: string;
}) {
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const newLabel = labelFromInput(when);

  async function submit() {
    const proposed = new Date(when);
    if (!when || Number.isNaN(proposed.getTime()) || proposed.getTime() <= Date.now()) {
      toast.error("Выберите новое время в будущем");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/change-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "RESCHEDULE", proposedStartAt: proposed.toISOString(), reason: "" }),
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
          <div className="pcab-current-s">{clientLabel} · Индивидуальная</div>
        </div>
      </div>

      <div className="pcab-flabel">Новое время</div>
      <label className="pcab-fieldinput" data-testid="reschedule-when">
        <span className="ic" aria-hidden="true">
          <Calendar width={18} height={18} strokeWidth={1.7} />
        </span>
        <input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          aria-label="Новое время сессии"
          required
        />
        <span className="chev" aria-hidden="true">
          <ChevronRight width={18} height={18} />
        </span>
      </label>

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
        disabled={busy}
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
