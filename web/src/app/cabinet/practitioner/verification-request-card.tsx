"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export function VerificationRequestCard({ pendingStatus }: { pendingStatus: string | null }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [portfolio, setPortfolio] = useState("");
  const [status, setStatus] = useState(pendingStatus);
  const [busy, setBusy] = useState(false);

  // X8: Russian, human status labels (no raw enum, no «уже в очереди»).
  const STATUS_LABELS: Record<string, string> = {
    PENDING: "На проверке",
    REVIEWING: "Проверяем документы",
    APPROVED: "Подтверждён",
    REJECTED: "Отклонена",
  };

  async function submit() {
    // X8: a verification request must actually describe what to verify.
    if (note.trim().length < 20) {
      toast.error("Опишите, что нужно подтвердить: образование, опыт, ссылки на документы (от 20 символов).");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/practitioner/verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note, portfolio }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Не удалось отправить запрос");
      setStatus(data.status ?? "PENDING");
      setOpen(false);
      toast.success("Запрос на верификацию отправлен");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось отправить запрос");
    } finally {
      setBusy(false);
    }
  }

  if (status) {
    const isRejected = status === "REJECTED";
    return (
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] p-3 text-sm text-[var(--soft-ink-soft)]">
        <ShieldCheck className="size-4 shrink-0 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
        <span>
          Статус верификации: <span className="font-semibold text-[var(--soft-bordeaux)]">{STATUS_LABELS[status] ?? status}</span>.
          {status === "PENDING" || status === "REVIEWING" ? " Ответ в течение 1–2 дней." : ""}
          {isRejected ? " Можно подать повторно." : ""}
        </span>
        {isRejected && (
          <button type="button" className="soft-chip ml-auto" onClick={() => setStatus(null)}>
            Подать снова
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3">
      {!open ? (
        <button
          type="button"
          className="soft-button soft-button-primary"
          style={{ minHeight: "2rem", padding: "0.4rem 0.9rem", fontSize: "0.8125rem" }}
          onClick={() => setOpen(true)}
          data-testid="practitioner-verification-open"
        >
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          Пройти верификацию
        </button>
      ) : (
        <div className="rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-3">
          <label className="text-xs font-semibold text-[var(--soft-bordeaux)]" htmlFor="verification-note">
            Что проверить
          </label>
          <textarea
            id="verification-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="soft-input mt-1 min-h-20 w-full resize-none py-2 text-sm"
            placeholder="Например: документы, профильное образование, опыт, портфолио."
          />
          <label className="mt-2 block text-xs font-semibold text-[var(--soft-bordeaux)]" htmlFor="verification-portfolio">
            Ссылка на документы или портфолио
          </label>
          <input
            id="verification-portfolio"
            value={portfolio}
            onChange={(event) => setPortfolio(event.target.value)}
            className="soft-input mt-1 h-9 w-full text-sm"
            placeholder="https://..."
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="soft-button soft-button-primary" disabled={busy || note.trim().length < 20} onClick={submit}>
              {busy ? "Отправляем..." : "Отправить на проверку"}
            </button>
            <button type="button" className="soft-button soft-button-ghost" disabled={busy} onClick={() => setOpen(false)}>
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
