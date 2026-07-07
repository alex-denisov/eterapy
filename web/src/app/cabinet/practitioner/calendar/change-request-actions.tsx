"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

// B481 — действия практика по клиентскому запросу переноса/отмены:
// Согласовать (для поздней отмены — «Со штрафом» / «Без штрафа») · Отклонить.

export function ChangeRequestActions({
  bookingId,
  requestId,
  penaltyApplies,
}: {
  bookingId: string;
  requestId: string;
  penaltyApplies: boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function resolve(action: "approve" | "decline", waivePenalty = false) {
    setBusy(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/change-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, waivePenalty }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Не удалось выполнить действие");
      toast.success(action === "approve" ? "Запрос согласован" : "Запрос отклонён");
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось выполнить действие");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2" data-testid="practitioner-change-request-actions">
      {penaltyApplies ? (
        <>
          <button
            type="button"
            className="soft-button soft-button-primary"
            style={{ minHeight: "2rem", padding: "0.35rem 0.8rem", fontSize: "0.8rem" }}
            disabled={busy}
            onClick={() => resolve("approve", false)}
            title="Отмена согласована, поздний штраф удерживается с клиента"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
            Согласовать
          </button>
          <button
            type="button"
            className="soft-button soft-button-ghost"
            style={{ minHeight: "2rem", padding: "0.35rem 0.8rem", fontSize: "0.8rem" }}
            disabled={busy}
            onClick={() => resolve("approve", true)}
            data-testid="practitioner-change-request-waive"
            title="Отмена согласована, штраф прощён — клиенту полный возврат"
          >
            Без штрафа
          </button>
        </>
      ) : (
        <button
          type="button"
          className="soft-button soft-button-primary"
          style={{ minHeight: "2rem", padding: "0.35rem 0.8rem", fontSize: "0.8rem" }}
          disabled={busy}
          onClick={() => resolve("approve")}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
          Согласовать
        </button>
      )}
      <button
        type="button"
        className="soft-button soft-button-ghost"
        style={{ minHeight: "2rem", padding: "0.35rem 0.8rem", fontSize: "0.8rem" }}
        disabled={busy}
        onClick={() => resolve("decline")}
      >
        Отклонить
      </button>
    </div>
  );
}
