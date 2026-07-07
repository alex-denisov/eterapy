"use client";

import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

// B466 — (пере)генерация AI-разбора по транскрипту (PUT /api/video/transcript).
// B434: первый разбор тратит единицу квоты, регенерация — бесплатна.

export function RegenerateNotesButton({ videoSessionId, label }: { videoSessionId: string; label: string }) {
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const res = await fetch("/api/video/transcript", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoSessionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Не удалось сгенерировать разбор");
      toast.success("Разбор обновлён");
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сгенерировать разбор");
      setBusy(false);
    }
  }

  return (
    <button type="button" className="soft-chip inline-flex items-center gap-1.5" disabled={busy} onClick={run}>
      {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="size-3.5" aria-hidden="true" />}
      {label}
    </button>
  );
}
