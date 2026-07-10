"use client";

import { useState } from "react";
import { Calendar, ChevronLeft, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { appUrl } from "@/lib/subdomain";

// B466 R9-4 P3 — мобильная «Отмена сессии» 1-в-1 по mockup
// practitioner-calendar-cancel.html: карточка сессии → предупреждение
// (динамический срок до начала) → причина (чипы) → отменить / не отменять.
// Практик отменяет: клиенту ВСЕГДА полный возврат; частые поздние отмены
// снижают приоритет в каталоге (B484). Тот же эндпоинт, что и десктоп:
// PATCH /api/bookings/[id] {status:"CANCELLED", reason}.

const REASONS = ["Болезнь", "Форс-мажор", "Перенос невозможен", "Другое"];

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

function leadLabel(startAt: string | null): string {
  if (!startAt) return "до начала сессии";
  const hours = (new Date(startAt).getTime() - Date.now()) / 3_600_000;
  if (hours < 24) return "менее чем за 24 часа до начала";
  const days = Math.floor(hours / 24);
  return `за ${days} ${plural(days, "день", "дня", "дней")} до начала`;
}

export function CancelMobile({
  bookingId,
  clientLabel,
  currentLabel,
  priceLabel,
  startAt,
}: {
  bookingId: string;
  clientLabel: string;
  currentLabel: string;
  priceLabel: string;
  startAt: string | null;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function cancel() {
    setBusy(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED", reason: reason ?? "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Не удалось отменить сессию");
      toast.success("Сессия отменена — клиент получит полный возврат");
      window.location.href = "/cabinet/practitioner/calendar";
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось отменить сессию");
      setBusy(false);
    }
  }

  return (
    <div className="pcab-screen md:hidden" data-pcab-top data-testid="practitioner-cancel-mobile">
      <div className="pcab-topbar">
        <Link
          href={appUrl(`/practitioner/calendar/booking/${bookingId}`)}
          className="pcab-roundbtn"
          aria-label="Назад"
        >
          <ChevronLeft width={19} height={19} aria-hidden="true" />
        </Link>
        <span className="pcab-topbar-title">Отмена сессии</span>
        <span className="pcab-topbar-spacer" />
      </div>

      <div className="pcab-current" style={{ marginTop: 16 }}>
        <div className="pcab-current-ic" aria-hidden="true">
          <Calendar width={19} height={19} strokeWidth={1.7} />
        </div>
        <div>
          <div className="pcab-current-t">{currentLabel}</div>
          <div className="pcab-current-s">
            {clientLabel} · Индивидуальная · {priceLabel}
          </div>
        </div>
      </div>

      <div className="pcab-warn" data-testid="cancel-warning">
        <div className="pcab-warn-ic" aria-hidden="true">
          <TriangleAlert width={20} height={20} strokeWidth={1.8} />
        </div>
        <div>
          <div className="pcab-warn-t">Вы отменяете {leadLabel(startAt)}</div>
          <ul className="pcab-warn-list">
            <li>Клиент получит полный возврат оплаты.</li>
            <li>Клиенту придёт уведомление об отмене.</li>
            <li>Частые поздние отмены (менее чем за 24 ч) снижают ваш приоритет в каталоге.</li>
          </ul>
        </div>
      </div>

      <div className="pcab-flabel">
        Причина <span className="opt">(необязательно, увидит клиент)</span>
      </div>
      <div className="pcab-reasons" data-testid="cancel-reasons">
        {REASONS.map((r) => (
          <button
            key={r}
            type="button"
            className={`pcab-rchip${reason === r ? " active" : ""}`}
            aria-pressed={reason === r}
            onClick={() => setReason((prev) => (prev === r ? null : r))}
          >
            {r}
          </button>
        ))}
      </div>

      <div className="pcab-cancel-actions">
        <button
          type="button"
          className="pcab-btn-danger"
          disabled={busy}
          onClick={cancel}
          data-testid="cancel-confirm"
        >
          {busy ? "Отменяем…" : "Отменить сессию"}
        </button>
        <Link
          href={appUrl(`/practitioner/calendar/booking/${bookingId}`)}
          className="pcab-btn block pcab-btn-ghost"
        >
          Не отменять
        </Link>
      </div>
      <div className="pcab-footnote">
        Если время просто не подходит — лучше{" "}
        <Link href={appUrl(`/practitioner/calendar/booking/${bookingId}/reschedule`)} className="pcab-link">
          <b>перенести</b>
        </Link>{" "}
        сессию, а не отменять.
      </div>
    </div>
  );
}
