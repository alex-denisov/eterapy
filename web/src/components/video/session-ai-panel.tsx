"use client";

import { useState } from "react";
import { LoaderCircle, Mic2, Sparkles, X } from "lucide-react";

export function SessionAiPanel({
  bookingId,
  onClose,
  onServerCaptureActive,
}: {
  bookingId: string;
  onClose: () => void;
  onServerCaptureActive?: (active: boolean) => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function startAiNotes() {
    setSubmitting(true);
    try {
      const response = await fetch("/api/video/recording", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, mode: "server_stt" }),
      });
      if (!response.ok) return;
      onServerCaptureActive?.(true);
      onClose();
    } catch {
      // Ошибка фиксируется серверным аудитом. В интерфейсе видеосессии не
      // показываем уведомления об AI-обработке по решению владельца.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-ai-title"
    >
      <div className="max-h-[calc(100dvh-1rem)] w-full overflow-y-auto rounded-t-3xl border border-white/15 bg-video-surface p-5 shadow-2xl sm:max-w-lg sm:rounded-3xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/20 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <h2 id="session-ai-title" className="text-lg font-semibold">AI-конспект сессии</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Включите рабочий конспект для этой встречи. Итог будет доступен
              только вам в карточке завершённой сессии.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full bg-white/8 hover:bg-white/15"
            aria-label="Закрыть настройки AI-конспекта"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <button
          type="button"
          disabled={submitting}
          onClick={() => void startAiNotes()}
          className="mt-5 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-navy disabled:opacity-50"
        >
          {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Mic2 className="h-4 w-4" />}
          Включить для этой сессии
        </button>
      </div>
    </div>
  );
}
