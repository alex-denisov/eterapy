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

interface ReviewModalProps {
  bookingId: string;
  practitionerName: string;
  onSuccess: () => void;
  onClose: () => void;
  open: boolean;
}

export function ReviewModal({ bookingId, practitionerName, onSuccess, onClose, open }: ReviewModalProps) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) { toast.error("Выберите оценку"); return; }

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
      <DialogContent className="max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Оставить отзыв</DialogTitle>
          <DialogDescription>Сессия с {practitionerName}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Stars */}
          <div>
            <p className="text-sm text-muted-foreground mb-2">Оценка *</p>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHover(star)}
                  onMouseLeave={() => setHover(0)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center transition-transform hover:scale-110"
                  aria-label={`Оценка ${star} из 5`}
                >
                  <span className={`text-3xl ${(hover || rating) >= star ? "text-primary" : "text-muted-foreground/30"}`}>★</span>
                </button>
              ))}
            </div>
            {rating > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {["", "Плохо", "Не очень", "Нормально", "Хорошо", "Отлично"][rating]}
              </p>
            )}
          </div>

          {/* Text */}
          <div>
            <label htmlFor="review-text" className="text-sm text-muted-foreground mb-1 block">
              Комментарий <span className="text-muted-foreground/50">(необязательно)</span>
            </label>
            <textarea
              id="review-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Расскажите о своём опыте..."
              rows={3}
              maxLength={1000}
              className="w-full resize-none rounded-lg border border-border/40 bg-card/50 p-3 text-sm focus:border-primary focus:outline-none"
            />
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border/40 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={loading || !rating}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-navy disabled:opacity-50"
            >
              {loading ? "Отправка..." : "Отправить отзыв"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
