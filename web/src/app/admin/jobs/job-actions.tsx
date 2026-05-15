"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  jobId: string;
  status: string;
  maxAttempts: number;
}

export function JobActions({ jobId, status, maxAttempts }: Props) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function requeue() {
    if (!confirm("Повторить задачу? Она будет поставлена в очередь заново.")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/requeue`, { method: "POST" });
      if (res.ok) {
        router.refresh();
      } else {
        const d = await res.json().catch(() => ({}));
        alert(d.error ?? "Не удалось повторить задачу");
      }
    } finally {
      setLoading(false);
    }
  }

  if (!["FAILED", "DEAD"].includes(status)) return null;

  return (
    <button
      onClick={requeue}
      disabled={loading}
      className="shrink-0 rounded-lg border border-border/30 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-border/60 transition-colors disabled:opacity-50"
    >
      {loading ? "..." : `↩ Повторить (${maxAttempts} попыток)`}
    </button>
  );
}
