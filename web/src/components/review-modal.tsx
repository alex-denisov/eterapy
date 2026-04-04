"use client";

import { useState } from "react";
import { toast } from "sonner";

interface ReviewModalProps {
  bookingId: string;
  practitionerName: string;
  onSuccess: () => void;
  onClose: () => void;
}

export function ReviewModal({ bookingId, practitionerName, onSuccess, onClose }: ReviewModalProps) {
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
      } else {
        toast.error(data.error ?? "Ошибка");
      }
    } catch { toast.error("Ошибка сети"); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-border/40 bg-navy p-6 shadow-2xl">
        <h2 className="font-heading text-xl font-bold mb-1">Оставить отзыв</h2>
        <p className="text-sm text-muted-foreground mb-5">Сессия с {practitionerName}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Stars */}
          <div>
            <p className="text-sm text-muted-foreground mb-2">Оценка *</p>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button key={star} type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHover(star)}
                  onMouseLeave={() => setHover(0)}
                  className="text-3xl transition-transform hover:scale-110">
                  <span className={(hover || rating) >= star ? "text-primary" : "text-muted-foreground/30"}>★</span>
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
            <label className="text-sm text-muted-foreground mb-1 block">
              Комментарий <span className="text-muted-foreground/50">(необязательно)</span>
            </label>
            <textarea value={text} onChange={(e) => setText(e.target.value)}
              placeholder="Расскажите о своём опыте..."
              rows={3} maxLength={1000}
              className="w-full resize-none rounded-lg border border-border/40 bg-card/50 p-3 text-sm focus:border-primary focus:outline-none" />
          </div>

          <div className="flex gap-2">
            <button type="submit" disabled={loading || !rating}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-navy disabled:opacity-50">
              {loading ? "Отправка..." : "Отправить отзыв"}
            </button>
            <button type="button" onClick={onClose}
              className="rounded-lg border border-border/40 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground">
              Отмена
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
