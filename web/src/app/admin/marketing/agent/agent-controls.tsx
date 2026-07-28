"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function MarketingAgentControls({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState(false);

  async function setEnabled(next: boolean) {
    const response = await fetch("/api/admin/marketing/agent/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next }),
    });
    if (!response.ok) {
      toast.error("Не удалось изменить состояние SMM-агента");
      return;
    }
    toast.success(next ? "SMM-агент включён" : "SMM-агент остановлен");
    startTransition(() => router.refresh());
  }

  async function runNow() {
    setRunning(true);
    try {
      const response = await fetch("/api/admin/marketing/agent/run", { method: "POST" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Запуск не удался");
      toast.success("Цикл выполнен; результаты записаны в реестр");
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Запуск не удался");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        className="soft-admin-action"
        data-variant={enabled ? "danger" : "primary"}
        disabled={pending}
        onClick={() => void setEnabled(!enabled)}
      >
        {enabled ? "Остановить агента" : "Включить агента"}
      </button>
      <button
        type="button"
        className="soft-admin-action"
        disabled={running || !enabled}
        onClick={() => void runNow()}
      >
        {running ? "Выполняется…" : "Запустить цикл сейчас"}
      </button>
    </div>
  );
}
