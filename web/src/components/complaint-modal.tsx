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
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!reason) { toast.error("Выберите причину жалобы"); return; }
    if (description.trim().length < 20) { toast.error("Опишите ситуацию подробнее (минимум 20 символов)"); return; }

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
      <DialogContent className="max-w-lg" showCloseButton={false} data-testid="support-complaint-flow">
        <DialogHeader>
          <DialogTitle>Подать жалобу</DialogTitle>
          <DialogDescription>
            Сессия с {practitionerName}. Мы сохраним обращение как support-case и покажем статус в админской очереди.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Причина */}
          <div>
            <label className="text-sm font-medium mb-3 block">Причина жалобы *</label>
            <div className="space-y-2">
              {REASONS.map((r) => (
                <label key={r.value} className={`flex cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border px-4 py-3 transition-colors ${
                  reason === r.value ? "border-brand-soft-gold/45 bg-brand-soft-gold/10" : "border-border/20 hover:border-brand-soft-gold/30"
                }`}>
                  <input
                    type="radio"
                    name="complaint-reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="accent-[var(--brand-warm-gold)]"
                  />
                  <span className="text-sm">{r.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Описание */}
          <div>
            <label htmlFor="complaint-desc" className="text-sm font-medium mb-1.5 block">Опишите ситуацию *</label>
            <textarea
              id="complaint-desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Что именно произошло? Чем больше деталей, тем быстрее мы разберёмся..."
              className="premium-input h-28 w-full resize-none px-3 py-2.5 text-sm"
            />
            <p className="text-xs text-muted-foreground/50 mt-1">{description.length} / минимум 20 символов</p>
          </div>

          {/* Предупреждение */}
          <div className="soft-card-flat px-4 py-3 text-xs leading-relaxed text-[var(--soft-ink-soft)]">
            <p className="font-medium text-[var(--soft-bordeaux)]">Что произойдёт дальше</p>
            <p className="mt-1">
              Жалоба попадает в очередь модерации, выплата по спорной встрече может быть временно удержана, а возврат решается после проверки.
              Если есть риск для безопасности, напишите напрямую на support@eterapy.com или звоните в экстренные службы.
            </p>
            <p className="mt-2 text-[var(--soft-ink-faint)]">Стандартная эскалация: первичный ответ до 24 часов.</p>
          </div>
        </div>

        <DialogFooter>
          <button
            onClick={onClose}
            className="flex-1 rounded-full border border-border/40 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Отмена
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 rounded-full bg-[linear-gradient(180deg,#ef7777,#be3b3b)] py-2.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(190,59,59,0.22)] transition-[filter,transform] hover:brightness-105 active:scale-[0.96] disabled:opacity-50"
          >
            {submitting ? "Отправка..." : "Подать жалобу"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
