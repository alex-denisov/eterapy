"use client";

import { useState } from "react";
import { toast } from "sonner";

export function AdminActions({ practitionerId }: { practitionerId: string }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<"approved" | "rejected" | null>(null);

  async function updateStatus(status: "ACTIVE" | "BLOCKED") {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/practitioners", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ practitionerId, status }),
      });
      const data = await res.json();
      if (data.ok) {
        setDone(status === "ACTIVE" ? "approved" : "rejected");
        toast.success(status === "ACTIVE" ? "Практик одобрен" : "Заявка отклонена");
      } else {
        toast.error(data.error ?? "Не удалось обновить статус");
      }
    } catch {
      toast.error("Ошибка");
    } finally {
      setLoading(false);
    }
  }

  if (done === "approved") return <span className="text-xs text-green-400">✓ Одобрен</span>;
  if (done === "rejected") return <span className="text-xs text-muted-foreground">Отклонён</span>;

  return (
    <div className="flex gap-2">
      <button onClick={() => updateStatus("ACTIVE")} disabled={loading}
        className="rounded-lg border border-green-500/30 px-3 py-1 text-xs text-green-400 hover:bg-green-500/10 transition-colors disabled:opacity-50">
        Одобрить
      </button>
      <button onClick={() => updateStatus("BLOCKED")} disabled={loading}
        className="rounded-lg border border-border/40 px-3 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
        Отклонить
      </button>
    </div>
  );
}
