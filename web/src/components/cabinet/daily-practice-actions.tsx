"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Compass, Footprints, Sparkles } from "lucide-react";
import { daysWord } from "@/lib/streak-display";

const QUESTION_LIMIT = 600;

// B375 (M26): баллы начисляются по вехам серии (3/7/14/30 дней), не за каждый
// день. API возвращает milestones: number[] — собираем тёплое сообщение.
// Round-5 #6c: без слова «веха» — человеческим языком, с подсказкой, когда
// придёт следующая награда.
const MILESTONE_REWARDS: Record<number, string> = {
  3: "+1 балл",
  7: "+2 балла и «итог недели»",
  14: "+2 балла",
  30: "+3 балла",
};

function milestoneMessage(payload: { milestones?: number[]; streakCount?: number | null }): string | null {
  const milestones = payload.milestones ?? [];
  if (milestones.length > 0) {
    const parts = milestones.map((m) => `${MILESTONE_REWARDS[m] ?? "награда"} за ${m} ${daysWord(m)} подряд`);
    return `День отмечен — вам начислено ${parts.join("; ")}!`;
  }
  const streak = typeof payload.streakCount === "number" ? payload.streakCount : 0;
  if (streak === 1) {
    return "День отмечен — это первый день вашей серии. Возвращайтесь завтра: за 3 дня подряд придёт +1 балл.";
  }
  if (streak > 1) {
    const next = Object.keys(MILESTONE_REWARDS).map(Number).find((m) => m > streak);
    return next
      ? `День отмечен. Ваша серия — ${streak} ${daysWord(streak)} подряд; на ${next}-й день придёт ${MILESTONE_REWARDS[next]}.`
      : `День отмечен. Ваша серия — ${streak} ${daysWord(streak)} подряд: все награды серии уже ваши!`;
  }
  return null;
}

interface DailyPracticeActionsProps {
  completed: boolean;
  /** Full three-beat ritual surfaces these; the compact cabinet-home CTA omits them. */
  variant?: "compact" | "full";
  /** A suggested вопрос дня the user can borrow if they're stuck (full variant). */
  prompt?: string;
  perspective?: string | null;
  step?: string | null;
  /** The user-authored вопрос дня stored on the card (full variant). */
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
  const [question, setQuestion] = useState(initialReflection ?? "");
  const [beats, setBeats] = useState<{ perspective: string | null; step: string | null }>({
    perspective: perspective ?? null,
    step: step ?? null,
  });
  const [message, setMessage] = useState<string | null>(
    completed ? "Практика на сегодня завершена." : null,
  );
  const router = useRouter();

  const isFull = variant === "full";

  // Compact CTA (cabinet home): a single "mark done" action, no ritual.
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
      setMessage(milestoneMessage(payload) ?? "Практика уже была завершена сегодня.");
      // Round-5 #6b: server-rendered недельная полоска и бейдж серии обновляются
      // сразу, без ручного refresh страницы.
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось завершить практику");
    } finally {
      setLoading(false);
    }
  }

  // Full ritual (/cabinet/practice): the user writes their own вопрос дня, the
  // LLM returns взгляд дня + маленький шаг.
  async function reflect() {
    const trimmed = question.trim();
    if (trimmed.length < 3) {
      setMessage("Запишите вопрос дня — хотя бы несколько слов.");
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/cabinet/daily-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reflect", question: trimmed }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Не удалось обработать вопрос");
      setDone(true);
      setBeats({
        perspective: payload.card?.perspective ?? beats.perspective,
        step: payload.card?.step ?? beats.step,
      });
      setMessage(milestoneMessage(payload) ?? "Практика на сегодня уже пройдена.");
      // Round-5 #6b: день в недельной полоске отмечается сразу после ответа.
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось обработать вопрос");
    } finally {
      setLoading(false);
    }
  }

  if (!isFull) {
    return (
      <div className="mt-3">
        {/* B464 round-4 #6: plain .soft-button — the shadcn <Button> mixed the
            old theme's bg-primary hover utilities into the soft palette and
            the hover state lost contrast. */}
        <button
          type="button"
          onClick={completePractice}
          disabled={done || loading}
          className={done ? "soft-button soft-button-ghost" : "soft-button soft-button-primary"}
        >
          {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="size-4" aria-hidden="true" />}
          {done ? "Практика завершена" : "Отметить практику"}
        </button>
        {message && (
          <p className="mt-2 text-xs leading-relaxed text-[var(--soft-ink-faint)]">
            {message}
          </p>
        )}
      </div>
    );
  }

  // ---- Full variant ----
  if (done) {
    return (
      <div className="mt-5" data-testid="practice-ritual">
        {/* Beat 1 — the user's own вопрос дня */}
        {question.trim() && (
          <div className="rounded-[1.25rem] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4" data-testid="practice-user-question">
            <p className="soft-eyebrow inline-flex items-center gap-1.5 text-[var(--soft-terracotta-dark)]">
              <Sparkles className="size-3.5" aria-hidden="true" />
              ваш вопрос дня
            </p>
            <p className="mt-2 font-heading text-[17px] italic leading-relaxed text-[var(--soft-bordeaux)]">
              {question.trim()}
            </p>
          </div>
        )}

        {/* Beats 2 & 3 — взгляд дня + маленький шаг */}
        {(beats.perspective || beats.step) && (
          <div className="mt-3 grid gap-3" data-testid="practice-beats">
            {beats.perspective && (
              <div className="rounded-[1.25rem] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4" data-testid="practice-perspective">
                <p className="soft-eyebrow inline-flex items-center gap-1.5 text-[var(--soft-terracotta-dark)]">
                  <Compass className="size-3.5" aria-hidden="true" />
                  взгляд дня
                </p>
                <p className="mt-2 text-[15px] leading-relaxed text-[var(--soft-ink)]">{beats.perspective}</p>
              </div>
            )}
            {beats.step && (
              <div className="rounded-[1.25rem] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4" data-testid="practice-step">
                <p className="soft-eyebrow inline-flex items-center gap-1.5 text-[var(--soft-terracotta-dark)]">
                  <Footprints className="size-3.5" aria-hidden="true" />
                  маленький шаг
                </p>
                <p className="mt-2 text-[15px] leading-relaxed text-[var(--soft-ink)]">{beats.step}</p>
              </div>
            )}
          </div>
        )}

        <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--soft-terracotta-dark)]">
          <CheckCircle2 className="size-3.5" aria-hidden="true" />
          {message ?? "Практика на сегодня завершена."}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-5" data-testid="practice-ritual">
      <label className="soft-eyebrow" htmlFor="practice-question">
        ваш вопрос дня
      </label>
      <textarea
        id="practice-question"
        className="soft-input mt-2 min-h-28 w-full resize-y"
        placeholder="В чём сегодня хочется разобраться? Например: «Почему меня задевает эта ситуация на работе?»"
        value={question}
        maxLength={QUESTION_LIMIT}
        onChange={(event) => setQuestion(event.target.value)}
        data-testid="practice-reflection-input"
      />
      <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--soft-ink-faint)]">
        <span>Ваш вопрос виден только вам.</span>
        <span>{question.length}/{QUESTION_LIMIT}</span>
      </div>

      {prompt && !question.trim() && (
        <button
          type="button"
          onClick={() => setQuestion(prompt)}
          className="mt-2 inline-flex items-start gap-1.5 text-left text-xs text-[var(--soft-terracotta-dark)] underline-offset-2 hover:underline"
          data-testid="practice-suggested-prompt"
        >
          <Sparkles className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Нужна подсказка? «{prompt}»
        </button>
      )}

      <button
        type="button"
        onClick={reflect}
        disabled={loading || question.trim().length < 3}
        className="soft-button soft-button-primary mt-3"
        data-testid="practice-complete-button"
      >
        {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Compass className="size-4" aria-hidden="true" />}
        Получить взгляд и шаг
      </button>
      {message && (
        <p className="mt-2 text-xs leading-relaxed text-[var(--soft-ink-faint)]">{message}</p>
      )}
    </div>
  );
}
