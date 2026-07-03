"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  COMPLAINT_DESCRIPTION_MAX,
  COMPLAINT_DESCRIPTION_MIN,
  complaintValidationError,
} from "@/lib/session-feedback";

const REASONS = [
  { value: "PRACTITIONER_NO_SHOW", label: "Практик не явился на сессию" },
  { value: "ETHICAL_VIOLATION",    label: "Нарушение этического кодекса" },
  { value: "MANIPULATION",         label: "Запугивание или манипуляции" },
  { value: "TECHNICAL_ISSUE",      label: "Технический сбой платформы" },
  { value: "EARLY_TERMINATION",    label: "Сессия закончилась раньше времени" },
  { value: "PAYMENT_ISSUE",        label: "Проблема с оплатой" },
  { value: "OTHER",                label: "Другое" },
];

interface Props {
  bookingId: string;
  practitionerName: string;
  onClose: () => void;
  onSubmitted: () => void;
  open: boolean;
}

export function ComplaintModal({ bookingId, practitionerName, onClose, onSubmitted, open }: Props) {
  // B464 round-4 #15: the reason is a compact select with NO pre-picked value —
  // the previous radio list pushed the modal past the viewport.
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    const validationError = complaintValidationError(reason, description);
    if (validationError) { setError(validationError); return; }
    setError(null);

    setSubmitting(true);
    try {
      const res = await fetch("/api/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, reason, description }),
      });
      const d = await res.json();
      if (d.ok) {
        toast.success("Жалоба принята. Мы рассмотрим её в течение 24 часов.");
        onSubmitted();
        onClose();
      } else {
        toast.error(d.error ?? "Ошибка");
      }
    } catch { toast.error("Ошибка сети"); }
    finally { setSubmitting(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="max-w-md" showCloseButton={false} data-testid="support-complaint-flow">
        <DialogHeader>
          <DialogTitle>Подать жалобу</DialogTitle>
          <DialogDescription>
            Сессия с {practitionerName}. Обращение попадёт в очередь модерации.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Причина — select, без выбранного по умолчанию значения */}
          <div>
            <label htmlFor="complaint-reason" className="mb-1.5 block text-sm font-medium">Причина жалобы *</label>
            <select
              id="complaint-reason"
              value={reason}
              onChange={(e) => { setReason(e.target.value); setError(null); }}
              className="soft-input w-full text-sm"
              data-testid="complaint-reason-select"
            >
              <option value="" disabled>Выберите причину</option>
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          {/* Описание */}
          <div>
            <label htmlFor="complaint-desc" className="mb-1.5 block text-sm font-medium">Опишите ситуацию *</label>
            <textarea
              id="complaint-desc"
              value={description}
              onChange={(e) => { setDescription(e.target.value.slice(0, COMPLAINT_DESCRIPTION_MAX)); setError(null); }}
              placeholder="Что именно произошло? Чем больше деталей, тем быстрее мы разберёмся..."
              maxLength={COMPLAINT_DESCRIPTION_MAX}
              className="soft-input h-24 w-full resize-none text-sm"
              data-testid="complaint-desc-input"
            />
            <p className="mt-1 flex justify-between text-[11px] text-[var(--soft-ink-faint)]">
              <span>минимум {COMPLAINT_DESCRIPTION_MIN} символов</span>
              <span>{description.length} / {COMPLAINT_DESCRIPTION_MAX}</span>
            </p>
          </div>

          {error && (
            <p className="text-sm text-[var(--soft-bordeaux)]" role="alert" data-testid="complaint-error">{error}</p>
          )}

          {/* Что дальше */}
          <div className="rounded-[14px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-deep)]/50 px-4 py-3 text-xs leading-relaxed text-[var(--soft-ink-soft)]">
            <p className="font-medium text-[var(--soft-bordeaux)]">Что произойдёт дальше</p>
            <p className="mt-1">
              Жалоба уходит модератору; выплата по спорной встрече может быть удержана до решения.
              Стандартная эскалация: первичный ответ до 24 часов. Если есть риск для безопасности — support@eterapy.com или экстренные службы.
            </p>
          </div>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            className="soft-button soft-button-ghost"
            style={{ minHeight: "2.5rem", padding: "0.5rem 1rem", fontSize: "0.875rem" }}
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="soft-button soft-button-primary flex-1 justify-center"
            style={{ minHeight: "2.5rem", padding: "0.5rem 1rem", fontSize: "0.875rem" }}
            data-testid="complaint-submit"
          >
            {submitting ? "Отправка..." : "Подать жалобу"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
