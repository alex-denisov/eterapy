"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { isLateChange, DEFAULT_LATE_CANCEL_PENALTY_PERCENT } from "@/lib/booking-change-rules";

// B481 — клиентские контролы для ПОДТВЕРЖДЁННОЙ сессии: запросить перенос или
// отмену (модальные предупреждения; отмена <24ч — предупреждение о штрафе),
// статус открытого запроса + отзыв; подтверждение переноса, предложенного
// практиком.

export interface ChangeRequestInfo {
  id: string;
  initiatedBy: string;
  type: string;
  proposedStartAt: string | null;
  penaltyApplies: boolean;
  reason: string | null;
}

interface Props {
  bookingId: string;
  status: string;
  slotStartAt: string | null;
  changeRequests: ChangeRequestInfo[];
}

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  });
}

export function BookingChangeControls({ bookingId, status, slotStartAt, changeRequests }: Props) {
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<"reschedule" | "cancel" | null>(null);
  const [when, setWhen] = useState("");
  const [reason, setReason] = useState("");

  const open = changeRequests[0] ?? null;
  const late = slotStartAt ? isLateChange(new Date(slotStartAt)) : false;

  if (status !== "CONFIRMED") return null;

  async function createRequest(type: "RESCHEDULE" | "CANCEL") {
    if (type === "RESCHEDULE") {
      const proposed = new Date(when);
      if (!when || Number.isNaN(proposed.getTime()) || proposed.getTime() <= Date.now()) {
        toast.error("Выберите новое время в будущем");
        return;
      }
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/change-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          proposedStartAt: type === "RESCHEDULE" ? new Date(when).toISOString() : undefined,
          reason,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Не удалось отправить запрос");
      toast.success("Запрос отправлен специалисту");
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось отправить запрос");
      setBusy(false);
    }
  }

  async function resolve(requestId: string, action: "approve" | "decline" | "withdraw") {
    setBusy(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/change-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Не удалось выполнить действие");
      toast.success(action === "approve" ? "Перенос подтверждён" : action === "decline" ? "Перенос отклонён" : "Запрос отозван");
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось выполнить действие");
      setBusy(false);
    }
  }

  // Открытый запрос: практик предложил перенос → клиент решает; свой запрос → статус + отозвать.
  if (open) {
    if (open.initiatedBy === "PRACTITIONER" && open.type === "RESCHEDULE" && open.proposedStartAt) {
      return (
        <div className="mt-3 rounded-xl border p-3" style={{ borderColor: "rgba(194,114,75,0.35)", background: "rgba(244,217,193,0.25)" }} data-testid="booking-practitioner-reschedule">
          <p className="text-sm font-medium">Специалист предлагает перенос на {fmtWhen(open.proposedStartAt)}</p>
          {open.reason && <p className="mt-0.5 text-xs text-[var(--soft-ink-faint)]">«{open.reason}»</p>}
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button type="button" className="soft-button soft-button-primary" style={{ minHeight: "2rem", padding: "0.35rem 0.8rem", fontSize: "0.8rem" }} disabled={busy} onClick={() => resolve(open.id, "approve")}>
              {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
              Подтвердить перенос
            </button>
            <button type="button" className="soft-button soft-button-ghost" style={{ minHeight: "2rem", padding: "0.35rem 0.8rem", fontSize: "0.8rem" }} disabled={busy} onClick={() => resolve(open.id, "decline")}>
              Оставить как есть
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="mt-3 rounded-xl border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-deep)]/50 p-3" data-testid="booking-change-pending">
        <p className="text-sm">
          Запрос {open.type === "CANCEL" ? "на отмену" : "на перенос"} отправлен — ждём ответа специалиста.
          {open.penaltyApplies && " Отмена менее чем за 24 часа может пройти со штрафом."}
        </p>
        <button type="button" className="soft-chip mt-2" disabled={busy} onClick={() => resolve(open.id, "withdraw")}>
          Отозвать запрос
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2" data-testid="booking-change-controls">
        <button type="button" className="soft-chip" onClick={() => setModal("reschedule")}>
          Перенести
        </button>
        <button type="button" className="soft-chip" onClick={() => setModal("cancel")}>
          Отменить
        </button>
      </div>

      <Dialog open={modal !== null} onOpenChange={(isOpen) => { if (!isOpen) setModal(null); }}>
        <DialogContent className="max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{modal === "cancel" ? "Отменить сессию?" : "Перенести сессию?"}</DialogTitle>
            <DialogDescription>
              {modal === "cancel"
                ? "Запрос на отмену уйдёт специалисту на согласование. При отмене более чем за 24 часа — полный возврат."
                : "Предложите новое время — специалист подтвердит перенос. Перенос бесплатный."}
            </DialogDescription>
          </DialogHeader>
          {/* B466 round-8 #8: explicit late-cancel penalty warning (owner: показывать
              явно). 50% удержание, специалист может простить; распределяется как
              оплаченная сессия (доля специалиста + комиссия платформы). */}
          {modal === "cancel" && late && (
            <div
              className="flex gap-2.5 rounded-xl border p-3"
              style={{ borderColor: "rgba(184,124,42,0.4)", background: "var(--soft-amber-bg, #F2E2C2)" }}
              data-testid="booking-late-cancel-warning"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" style={{ color: "var(--soft-amber-ink, #6E5114)" }} aria-hidden="true" />
              <p className="text-[13px] leading-relaxed" style={{ color: "var(--soft-amber-ink, #6E5114)" }}>
                До начала меньше 24 часов. По правилам поздней отмены удерживается{" "}
                <span className="font-semibold">{DEFAULT_LATE_CANCEL_PENALTY_PERCENT}% стоимости сессии</span> — специалист
                может простить штраф. Отмена более чем за 24 часа — полный возврат.
              </p>
            </div>
          )}
          {modal === "reschedule" && (
            <div>
              <label className="block text-xs font-semibold text-[var(--soft-bordeaux)]" htmlFor="client-reschedule-when">
                Новое время (МСК)
              </label>
              <input
                id="client-reschedule-when"
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                className="soft-input mt-1 h-11 w-full text-base"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-[var(--soft-bordeaux)]" htmlFor="client-change-reason">
              Комментарий (необязательно)
            </label>
            <textarea
              id="client-change-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="soft-input mt-1 min-h-16 w-full resize-y p-3 text-sm leading-relaxed"
            />
          </div>
          <DialogFooter>
            <button type="button" className="soft-button soft-button-ghost" style={{ minHeight: "2.25rem", padding: "0.5rem 1rem", fontSize: "0.875rem" }} onClick={() => setModal(null)} disabled={busy}>
              Назад
            </button>
            <button
              type="button"
              className="soft-button soft-button-primary"
              style={{ minHeight: "2.25rem", padding: "0.5rem 1rem", fontSize: "0.875rem" }}
              disabled={busy}
              onClick={() => createRequest(modal === "cancel" ? "CANCEL" : "RESCHEDULE")}
              data-testid="booking-change-submit"
            >
              {busy ? "Отправляем…" : modal === "cancel" ? "Запросить отмену" : "Запросить перенос"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
