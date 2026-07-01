"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";

interface Props {
  jobId: string;
  status: string;
  maxAttempts: number;
  label?: string;
}

export function JobActions({ jobId, status, maxAttempts, label = "Повторить" }: Props) {
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
      className="soft-admin-icon-button shrink-0"
      title={`${label} (${maxAttempts})`}
      aria-label={`${label} задачу ${jobId}`}
    >
      {loading ? "..." : <RotateCcw className="size-3.5" aria-hidden="true" />}
    </button>
  );
}
