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
  REVIEW_TEXT_MAX,
  reviewCommentRequired,
  reviewValidationError,
} from "@/lib/session-feedback";

interface ReviewModalProps {
  bookingId: string;
  practitionerName: string;
  onSuccess: () => void;
  onClose: () => void;
  open: boolean;
}

const RATING_LABELS = ["", "Плохо", "Не очень", "Нормально", "Хорошо", "Отлично"];

export function ReviewModal({ bookingId, practitionerName, onSuccess, onClose, open }: ReviewModalProps) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const commentRequired = reviewCommentRequired(rating);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = reviewValidationError(rating, text);
    if (validationError) { setError(validationError); return; }
    setError(null);

    setLoading(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, rating, text }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Спасибо за отзыв!");
        onSuccess();
        onClose();
      } else {
        toast.error(data.error ?? "Ошибка");
      }
    } catch { toast.error("Ошибка сети"); }
    finally { setLoading(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="max-w-sm" showCloseButton={false} data-testid="review-modal">
        <DialogHeader>
          <DialogTitle>Оставить отзыв</DialogTitle>
          <DialogDescription>Сессия с {practitionerName}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Stars */}
          <div>
            <p className="mb-1 text-sm text-[var(--soft-ink-soft)]">Оценка *</p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => { setRating(star); setError(null); }}
                  onMouseEnter={() => setHover(star)}
                  onMouseLeave={() => setHover(0)}
                  className="flex min-h-[44px] min-w-[42px] items-center justify-center transition-transform hover:scale-110"
                  aria-label={`Оценка ${star} из 5`}
                >
                  <span
                    className="text-3xl"
                    style={{ color: (hover || rating) >= star ? "var(--soft-terracotta)" : "var(--soft-paper-edge)" }}
                  >
                    ★
                  </span>
                </button>
              ))}
            </div>
            {rating > 0 && (
              <p className="mt-1 text-xs text-[var(--soft-ink-faint)]">{RATING_LABELS[rating]}</p>
            )}
          </div>

          {/* Text — required for 1–3★ so a low rating explains itself */}
          <div>
            <label htmlFor="review-text" className="mb-1 block text-sm text-[var(--soft-ink-soft)]">
              Комментарий{" "}
              {commentRequired ? (
                <span className="font-medium text-[var(--soft-bordeaux)]">обязательно при оценке 3 и ниже</span>
              ) : (
                <span className="text-[var(--soft-ink-faint)]">(необязательно)</span>
              )}
            </label>
            <textarea
              id="review-text"
              value={text}
              onChange={(e) => { setText(e.target.value.slice(0, REVIEW_TEXT_MAX)); setError(null); }}
              placeholder={commentRequired ? "Расскажите, что пошло не так — это поможет нам разобраться" : "Расскажите о своём опыте..."}
              rows={3}
              maxLength={REVIEW_TEXT_MAX}
              className="soft-input w-full resize-none text-sm"
              data-testid="review-text-input"
            />
            <p className="mt-1 text-right text-[11px] text-[var(--soft-ink-faint)]">{text.length} / {REVIEW_TEXT_MAX}</p>
          </div>

          {error && (
            <p className="text-sm text-[var(--soft-bordeaux)]" role="alert" data-testid="review-error">{error}</p>
          )}

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
              type="submit"
              disabled={loading || !rating}
              className="soft-button soft-button-primary flex-1 justify-center"
              style={{ minHeight: "2.5rem", padding: "0.5rem 1rem", fontSize: "0.875rem" }}
            >
              {loading ? "Отправка..." : "Отправить отзыв"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
