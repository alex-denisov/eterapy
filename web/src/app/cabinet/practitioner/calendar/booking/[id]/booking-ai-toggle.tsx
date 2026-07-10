"use client";

import { useState } from "react";
import { toast } from "sonner";

// B466/B434 (owner 2026-07-10) — РАБОЧИЙ per-session тумблер «AI-разбор этой
// сессии» на мобильной карточке брони. Пишет в тот же эндпоинт, что и экран
// «Разборы и AI»: PATCH /api/practitioner/ai-settings { bookingId, enabled }.
// Метеринг уважает Booking.aiAnalysisEnabled (practitioner-ai-metering.ts).
// Расшифровка и комплаенс — всегда включены, не метерятся (не про этот тумблер).

export function BookingAiToggle({
  bookingId,
  initialEnabled,
}: {
  bookingId: string;
  initialEnabled: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !enabled;
    setEnabled(next); // оптимистично
    setBusy(true);
    try {
      const res = await fetch("/api/practitioner/ai-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, enabled: next }),
      });
      if (!res.ok) throw new Error();
      toast.success(next ? "AI-разбор включён для этой сессии" : "AI-разбор выключен для этой сессии");
    } catch {
      setEnabled(!next); // откат
      toast.error("Не удалось изменить настройку");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pcab-airow" data-testid="practitioner-booking-mobile-analysis">
      <div className="pcab-airow-main">
        <div className="pcab-airow-t">AI-разбор этой сессии</div>
        <div className="pcab-airow-s">
          {enabled
            ? "После завершения сделаем резюме, заметки и транскрипт — потратит 1 разбор из месячной квоты."
            : "Разбор для этой сессии делать не будем. Расшифровка и комплаенс — всегда включены."}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="AI-разбор этой сессии"
        className={`pcab-toggle${enabled ? "" : " off"}`}
        onClick={toggle}
        disabled={busy}
        data-testid="practitioner-booking-ai-switch"
      >
        <span className="knob" aria-hidden="true" />
      </button>
    </div>
  );
}
