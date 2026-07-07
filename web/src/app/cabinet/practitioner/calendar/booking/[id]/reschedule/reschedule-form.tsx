"use client";

import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

// B481 — форма переноса практиком: новое время (МСК) + причина → запрос
// на подтверждение клиенту (BookingChangeRequest, initiatedBy=PRACTITIONER).

export function RescheduleForm({ bookingId }: { bookingId: string }) {
  const [when, setWhen] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
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
        body: JSON.stringify({ type: "RESCHEDULE", proposedStartAt: proposed.toISOString(), reason }),
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
    <form onSubmit={submit} className="soft-card mt-4 p-4 sm:p-5" data-testid="practitioner-reschedule-form">
      <label className="block text-xs font-semibold text-[var(--soft-bordeaux)]" htmlFor="reschedule-when">
        Новое время (МСК)
      </label>
      <input
        id="reschedule-when"
        type="datetime-local"
        value={when}
        onChange={(e) => setWhen(e.target.value)}
        className="soft-input mt-1 h-11 w-full text-base"
        required
      />
      <label className="mt-4 block text-xs font-semibold text-[var(--soft-bordeaux)]" htmlFor="reschedule-reason">
        Комментарий клиенту (необязательно)
      </label>
      <textarea
        id="reschedule-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="soft-input mt-1 min-h-20 w-full resize-y p-3 text-sm leading-relaxed"
        placeholder="Например: в это время у меня освободилось окно удобнее для вас"
      />
      <button type="submit" className="soft-button soft-button-primary mt-4 w-full justify-center sm:w-fit" disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
        Предложить перенос
      </button>
    </form>
  );
}
