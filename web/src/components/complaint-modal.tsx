"use client";

import { useState } from "react";
import { toast } from "sonner";

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
}

export function ComplaintModal({ bookingId, practitionerName, onClose, onSubmitted }: Props) {
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
      } else {
        toast.error(d.error ?? "Ошибка");
      }
    } catch { toast.error("Ошибка сети"); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg rounded-2xl border border-red-500/20 bg-navy shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/20 px-6 py-4">
          <div>
            <h2 className="font-heading font-semibold">Подать жалобу</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Сессия с {practitionerName}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-2xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-5">
          {/* Причина */}
          <div>
            <label className="text-sm font-medium mb-3 block">Причина жалобы *</label>
            <div className="space-y-2">
              {REASONS.map(r => (
                <label key={r.value} className={`flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                  reason === r.value ? "border-red-500/40 bg-red-500/5" : "border-border/20 hover:border-border/40"
                }`}>
                  <input type="radio" name="reason" value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="accent-red-400" />
                  <span className="text-sm">{r.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Описание */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">Опишите ситуацию *</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Что именно произошло? Чем больше деталей, тем быстрее мы разберёмся..."
              className="w-full rounded-lg border border-border/40 bg-card/30 px-3 py-2.5 text-sm resize-none h-28 focus:outline-none focus:border-primary/50"
            />
            <p className="text-xs text-muted-foreground/50 mt-1">{description.length} / минимум 20 символов</p>
          </div>

          {/* Предупреждение */}
          <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-4 py-3 text-xs text-yellow-400/80">
            ℹ️ Мы рассмотрим жалобу в течение 24 часов. Чат сессии и логи сохранены и будут использованы при разборе.
          </div>

          {/* Кнопки */}
          <div className="flex gap-3">
            <button onClick={onClose}
              className="flex-1 rounded-lg border border-border/40 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              Отмена
            </button>
            <button onClick={handleSubmit} disabled={submitting}
              className="flex-1 rounded-lg bg-red-500/80 py-2.5 text-sm font-semibold text-white hover:bg-red-500 transition-colors disabled:opacity-50">
              {submitting ? "Отправка..." : "Подать жалобу"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
