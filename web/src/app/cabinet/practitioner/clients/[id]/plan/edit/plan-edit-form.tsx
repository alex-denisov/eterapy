"use client";

import { useState } from "react";
import { Loader2, Minus, Plus, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import type { CarePlanGoal } from "@/lib/care-plan";

// B466 — форма плана: цели (слайдер прогресса −/+5%), методы (× / «+ метод»),
// фокус следующей сессии; AI-баннер «применить предложение».

interface Suggestion {
  goals: CarePlanGoal[];
  methods: string[];
  nextFocus: string[];
  note: string | null;
}

interface Props {
  clientId: string;
  initialGoals: CarePlanGoal[];
  initialMethods: string[];
  initialNextFocus: string[];
  suggestion: Suggestion | null;
}

let goalSeq = 0;
const newGoalId = () => `goal-new-${++goalSeq}-${Date.now()}`;

export function PlanEditForm({ clientId, initialGoals, initialMethods, initialNextFocus, suggestion }: Props) {
  const [goals, setGoals] = useState<CarePlanGoal[]>(initialGoals);
  const [methods, setMethods] = useState<string[]>(initialMethods);
  const [nextFocus, setNextFocus] = useState<string[]>(initialNextFocus);
  const [newMethod, setNewMethod] = useState("");
  const [newFocus, setNewFocus] = useState("");
  const [newGoal, setNewGoal] = useState("");
  const [suggestionState, setSuggestionState] = useState<"pending" | "applied" | "dismissed">(
    suggestion ? "pending" : "dismissed",
  );
  const [busy, setBusy] = useState(false);

  function applySuggestion() {
    if (!suggestion) return;
    if (suggestion.goals.length > 0) {
      setGoals((prev) => {
        const byTitle = new Map(prev.map((g) => [g.title.toLowerCase(), g] as const));
        for (const proposed of suggestion.goals) {
          const existing = byTitle.get(proposed.title.toLowerCase());
          if (existing) {
            byTitle.set(proposed.title.toLowerCase(), { ...existing, progress: proposed.progress, status: proposed.status });
          } else {
            byTitle.set(proposed.title.toLowerCase(), proposed);
          }
        }
        return [...byTitle.values()];
      });
    }
    if (suggestion.methods.length > 0) {
      setMethods((prev) => [...new Set([...prev, ...suggestion.methods])]);
    }
    if (suggestion.nextFocus.length > 0) {
      setNextFocus(suggestion.nextFocus);
    }
    setSuggestionState("applied");
  }

  function bumpProgress(id: string, delta: number) {
    setGoals((prev) => prev.map((g) => {
      if (g.id !== id) return g;
      const progress = Math.max(0, Math.min(100, g.progress + delta));
      return { ...g, progress, status: progress >= 100 ? "done" : g.status === "new" && progress > 0 ? "active" : g.status };
    }));
  }

  function addGoal() {
    const title = newGoal.trim();
    if (!title) return;
    setGoals((prev) => [...prev, { id: newGoalId(), title, progress: 0, status: "new" }]);
    setNewGoal("");
  }

  function addMethod() {
    const value = newMethod.trim();
    if (!value) return;
    setMethods((prev) => [...new Set([...prev, value])]);
    setNewMethod("");
  }

  function addFocus() {
    const value = newFocus.trim();
    if (!value) return;
    setNextFocus((prev) => [...prev, value]);
    setNewFocus("");
  }

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/practitioner/care-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          goals,
          methods,
          nextFocus,
          confirmAiSuggestion: suggestionState !== "pending",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Не удалось сохранить план");
      toast.success("План сохранён");
      window.location.href = `/cabinet/practitioner/clients/${clientId}?tab=plan`;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить план");
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 flex flex-col gap-4" data-testid="practitioner-plan-edit-form">
      {/* AI suggestion banner */}
      {suggestion && suggestionState === "pending" && (
        <section className="rounded-[18px] border-2 p-4" style={{ borderColor: "var(--soft-terracotta)", background: "var(--soft-paper-card)" }} data-testid="plan-ai-suggestion">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Sparkles className="h-4 w-4" style={{ color: "var(--soft-amber-ink,#6E5114)" }} />
            AI предложил обновление после сессии
          </p>
          {suggestion.note && <p className="mt-1.5 text-sm text-[var(--soft-ink-soft)]">{suggestion.note}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="soft-button soft-button-primary" style={{ minHeight: "2rem", padding: "0.35rem 0.8rem", fontSize: "0.8rem" }} onClick={applySuggestion}>
              Применить предложение
            </button>
            <button type="button" className="soft-button soft-button-ghost" style={{ minHeight: "2rem", padding: "0.35rem 0.8rem", fontSize: "0.8rem" }} onClick={() => setSuggestionState("dismissed")}>
              Отклонить
            </button>
          </div>
        </section>
      )}

      {/* Goals */}
      <section className="soft-card p-4 sm:p-5">
        <p className="soft-eyebrow">Цели</p>
        <div className="mt-3 flex flex-col gap-4">
          {goals.map((goal) => (
            <div key={goal.id} data-testid="plan-edit-goal">
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 text-sm font-medium">{goal.title}</p>
                <button type="button" aria-label={`Удалить цель ${goal.title}`} className="shrink-0 text-[var(--soft-ink-faint)] hover:text-[var(--soft-bordeaux)]" onClick={() => setGoals((prev) => prev.filter((g) => g.id !== goal.id))}>
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-1.5 flex items-center gap-2.5">
                <button type="button" aria-label="Меньше" className="soft-chip px-2" onClick={() => bumpProgress(goal.id, -5)}>
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--soft-paper-deep)]">
                  <div className="h-full rounded-full" style={{ width: `${goal.progress}%`, background: "var(--soft-bordeaux)" }} />
                </div>
                <button type="button" aria-label="Больше" className="soft-chip px-2" onClick={() => bumpProgress(goal.id, 5)}>
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <span className="w-10 shrink-0 text-right text-xs tabular-nums text-[var(--soft-ink-faint)]">{goal.progress}%</span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <input
            value={newGoal}
            onChange={(e) => setNewGoal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addGoal(); } }}
            placeholder="Новая цель"
            className="soft-input h-10 flex-1 text-sm"
          />
          <button type="button" className="soft-chip shrink-0" onClick={addGoal}>+ цель</button>
        </div>
      </section>

      {/* Methods */}
      <section className="soft-card p-4 sm:p-5">
        <p className="soft-eyebrow">Методы</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {methods.map((method) => (
            <span key={method} className="soft-chip inline-flex items-center gap-1.5">
              {method}
              <button type="button" aria-label={`Убрать метод ${method}`} onClick={() => setMethods((prev) => prev.filter((m) => m !== method))} className="text-[var(--soft-ink-faint)] hover:text-[var(--soft-bordeaux)]">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={newMethod}
            onChange={(e) => setNewMethod(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addMethod(); } }}
            placeholder="Например: дневник наблюдений"
            className="soft-input h-10 flex-1 text-sm"
          />
          <button type="button" className="soft-chip shrink-0" onClick={addMethod}>+ метод</button>
        </div>
        <p className="mt-2.5 text-xs leading-relaxed text-[var(--soft-ink-faint)]">
          AI выделяет применённые методы из разборов сессий — здесь вы правите и дополняете.
        </p>
      </section>

      {/* Next focus */}
      <section className="soft-card p-4 sm:p-5">
        <p className="soft-eyebrow">Фокус следующей сессии</p>
        <ul className="mt-2.5 flex flex-col gap-2">
          {nextFocus.map((item) => (
            <li key={item} className="flex items-center gap-2 text-sm text-[var(--soft-ink-soft)]">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--soft-terracotta)]" />
              <span className="min-w-0 flex-1">{item}</span>
              <button type="button" aria-label={`Убрать пункт ${item}`} onClick={() => setNextFocus((prev) => prev.filter((f) => f !== item))} className="shrink-0 text-[var(--soft-ink-faint)] hover:text-[var(--soft-bordeaux)]">
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex gap-2">
          <input
            value={newFocus}
            onChange={(e) => setNewFocus(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addFocus(); } }}
            placeholder="Что взять в работу на следующей встрече"
            className="soft-input h-10 flex-1 text-sm"
          />
          <button type="button" className="soft-chip shrink-0" onClick={addFocus}>+ пункт</button>
        </div>
      </section>

      <button type="button" className="soft-button soft-button-primary w-full justify-center sm:w-fit" disabled={busy} onClick={save} data-testid="plan-edit-save">
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        Сохранить план
      </button>
    </div>
  );
}
