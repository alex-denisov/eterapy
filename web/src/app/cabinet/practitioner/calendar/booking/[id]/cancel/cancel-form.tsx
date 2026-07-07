"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

// B484 — форма отмены практиком: причина (для клиента и метрики) + две кнопки
// («Отменить сессию» / «Не отменять»). Возврат клиенту происходит на сервере.

export function CancelBookingForm({ bookingId }: { bookingId: string }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function cancel() {
    setBusy(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED", reason }),
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
    <div className="soft-card mt-4 p-4 sm:p-5" data-testid="practitioner-cancel-form">
      <label className="block text-xs font-semibold text-[var(--soft-bordeaux)]" htmlFor="cancel-reason">
        Причина отмены
      </label>
      <textarea
        id="cancel-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="soft-input mt-1 min-h-20 w-full resize-y p-3 text-sm leading-relaxed"
        placeholder="Коротко: почему сессия не состоится — клиент увидит причину"
      />
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="soft-button"
          style={{ background: "var(--soft-bordeaux)", color: "#FBF1E4" }}
          disabled={busy}
          onClick={cancel}
          data-testid="practitioner-cancel-confirm"
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          Отменить сессию
        </button>
        <button
          type="button"
          className="soft-button soft-button-ghost"
          disabled={busy}
          onClick={() => { window.location.href = `/cabinet/practitioner/calendar/booking/${bookingId}`; }}
        >
          Не отменять
        </button>
      </div>
    </div>
  );
}
