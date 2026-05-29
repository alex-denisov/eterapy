"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Compass, Footprints } from "lucide-react";
import { Button } from "@/components/ui/button";

const REFLECTION_LIMIT = 1200;

interface DailyPracticeActionsProps {
  completed: boolean;
  /** Full three-beat ritual surfaces these; the compact cabinet-home CTA omits them. */
  variant?: "compact" | "full";
  prompt?: string;
  perspective?: string | null;
  step?: string | null;
  initialReflection?: string | null;
}

export function DailyPracticeActions({
  completed,
  variant = "compact",
  prompt,
  perspective,
  step,
  initialReflection,
}: DailyPracticeActionsProps) {
  const [done, setDone] = useState(completed);
  const [loading, setLoading] = useState(false);
  const [reflection, setReflection] = useState(initialReflection ?? "");
  const [message, setMessage] = useState<string | null>(completed ? "Практика на сегодня завершена." : null);

  const isFull = variant === "full";

  async function completePractice() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/cabinet/daily-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "complete",
          ...(isFull ? { reflectionText: reflection } : {}),
        }),
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

  // Compact CTA used on the cabinet home dashboard — single button, no ritual.
  if (!isFull) {
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

  // Full three-beat ritual on /cabinet/practice: ответ на вопрос дня → reveal
  // ракурс дня + маленький шаг.
  return (
    <div className="mt-5" data-testid="practice-ritual">
      <label className="soft-eyebrow" htmlFor="practice-reflection">
        ваш ответ на вопрос дня
      </label>
      <textarea
        id="practice-reflection"
        className="soft-input mt-2 min-h-28 w-full resize-y"
        placeholder={prompt ? `Ответьте себе: ${prompt}` : "Запишите, что приходит в ответ — без редактирования."}
        value={reflection}
        maxLength={REFLECTION_LIMIT}
        onChange={(event) => setReflection(event.target.value)}
        disabled={done}
        data-testid="practice-reflection-input"
      />
      <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--soft-ink-faint)]">
        <span>Ответ виден только вам.</span>
        <span>{reflection.length}/{REFLECTION_LIMIT}</span>
      </div>

      <Button
        type="button"
        onClick={completePractice}
        disabled={done || loading}
        className={done ? "soft-button soft-button-ghost mt-3" : "soft-button soft-button-primary mt-3"}
        data-testid="practice-complete-button"
      >
        {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="size-4" aria-hidden="true" />}
        {done ? "Практика завершена" : "Завершить практику"}
      </Button>
      {message && (
        <p className="mt-2 text-xs leading-relaxed text-[var(--soft-ink-faint)]">{message}</p>
      )}

      {/* Beats two & three reveal once the day is reflected on — keeping the
          ритуал order вопрос → ракурс → шаг. */}
      {done && (perspective || step) && (
        <div className="mt-5 grid gap-3" data-testid="practice-beats">
          {perspective && (
            <div className="rounded-[1.25rem] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4" data-testid="practice-perspective">
              <p className="soft-eyebrow inline-flex items-center gap-1.5 text-[var(--soft-terracotta-dark)]">
                <Compass className="size-3.5" aria-hidden="true" />
                ракурс дня
              </p>
              <p className="mt-2 text-[15px] leading-relaxed text-[var(--soft-ink)]">{perspective}</p>
            </div>
          )}
          {step && (
            <div className="rounded-[1.25rem] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4" data-testid="practice-step">
              <p className="soft-eyebrow inline-flex items-center gap-1.5 text-[var(--soft-terracotta-dark)]">
                <Footprints className="size-3.5" aria-hidden="true" />
                маленький шаг
              </p>
              <p className="mt-2 text-[15px] leading-relaxed text-[var(--soft-ink)]">{step}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
