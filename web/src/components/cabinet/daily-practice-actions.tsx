"use client";

import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DailyPracticeActions({
  completed,
}: {
  completed: boolean;
}) {
  const [done, setDone] = useState(completed);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(completed ? "Практика на сегодня завершена." : null);

  async function completePractice() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/cabinet/daily-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Не удалось завершить практику");
      setDone(true);
      setMessage(payload.rewardGranted ? "+1 кредит ясности начислен." : "Практика уже была завершена сегодня.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось завершить практику");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3">
      <Button
        type="button"
        onClick={completePractice}
        disabled={done || loading}
        className={done ? "soft-button soft-button-ghost" : "soft-button soft-button-primary"}
      >
        {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="size-4" aria-hidden="true" />}
        {done ? "Практика завершена" : "Отметить практику"}
      </Button>
      {message && (
        <p className="mt-2 text-xs leading-relaxed text-[var(--soft-ink-faint)]">
          {message}
        </p>
      )}
    </div>
  );
}
