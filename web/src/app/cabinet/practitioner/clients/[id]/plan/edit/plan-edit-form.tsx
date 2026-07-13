"use client";

import { useState } from "react";
import { Loader2, Minus, Plus, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import type { CarePlanGoal } from "@/lib/care-plan";

// B466 — форма плана: цели (слайдер прогресса −/+5%), методы (× / «+ метод»),
// фокус следующей сессии; AI-баннер «применить предложение».
// R9-4 P2: variant="pcab" — мобильная разметка 1-в-1 из mockup
// practitioner-client-plan-edit.html (goal-edit карты со слайдером и
// степперами, ai-sug чипы, dashed «Добавить цель», actionbar Отмена/
// Сохранить); обработчики и состояние общие с десктопной веткой.

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
  variant?: "pcab";
}

let goalSeq = 0;
const newGoalId = () => `goal-new-${++goalSeq}-${Date.now()}`;

export function PlanEditForm({ clientId, initialGoals, initialMethods, initialNextFocus, suggestion, variant }: Props) {
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

  if (variant === "pcab") {
    // Предложенный AI прогресс по названию цели — для чипов «AI: X% → Y%».
    const suggestedByTitle = new Map(
      (suggestion?.goals ?? []).map((g) => [g.title.toLowerCase(), g.progress] as const),
    );
    const suggestionPending = suggestion != null && suggestionState === "pending";
    return (
      <div data-testid="practitioner-plan-edit-form-mobile">
        {suggestionPending && (
          <div className="pcab-aibanner" data-testid="plan-ai-suggestion-mobile">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
              <path d="M12 2.6l1.9 5.1 5.1 1.9-5.1 1.9L12 16.6l-1.9-5.1L5 9.6l5.1-1.9z" />
            </svg>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="pcab-aibanner-t">AI предложил обновления после сессии</div>
              <div className="pcab-aibanner-s">
                {suggestion?.note ?? "Проверьте и подтвердите: прогресс — предложения из разбора, но решаете вы."}
              </div>
              <div style={{ display: "flex", gap: 7, marginTop: 9 }}>
                <button type="button" className="pcab-cbtn send" style={{ padding: "7px 12px", fontSize: 12 }} onClick={applySuggestion}>
                  Применить
                </button>
                <button type="button" className="pcab-cbtn ghost" style={{ padding: "7px 12px", fontSize: 12 }} onClick={() => setSuggestionState("dismissed")}>
                  Отклонить
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Цели */}
        <div className="pcab-section-head" style={{ margin: "20px 0 4px" }}>
          <span className="pcab-eyebrow">Цели</span>
        </div>
        {goals.map((goal) => {
          const proposed = suggestedByTitle.get(goal.title.toLowerCase());
          return (
            <div key={goal.id} className="pcab-goal-edit" data-testid="plan-edit-goal-mobile">
              <div className="pcab-goal-eh">
                <span className="pcab-goal-et">
                  {goal.title}
                  {goal.status === "new" && <span className="pcab-goal-new">AI предложил</span>}
                </span>
                <button
                  type="button"
                  className="pcab-goal-del"
                  aria-label={`Удалить цель ${goal.title}`}
                  onClick={() => setGoals((prev) => prev.filter((g) => g.id !== goal.id))}
                >
                  ×
                </button>
              </div>
              <div className="pcab-slider" aria-hidden="true">
                <div className="pcab-slider-fill" style={{ width: `${goal.progress}%` }} />
                <div className="pcab-slider-thumb" style={{ left: `${goal.progress}%` }} />
              </div>
              <div className="pcab-pct-row">
                {suggestionPending && proposed !== undefined ? (
                  <span className="pcab-aisug">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                      <polyline points="17 6 23 6 23 12" />
                    </svg>
                    {proposed === goal.progress ? "AI: без изменений" : `AI: ${goal.progress}% → ${proposed}%`}
                  </span>
                ) : (
                  <span />
                )}
                <div className="pcab-pct-ctl">
                  <button type="button" className="pcab-step" aria-label="Меньше" onClick={() => bumpProgress(goal.id, -5)}>
                    −
                  </button>
                  <span className="pcab-pct-val">{goal.progress}%</span>
                  <button type="button" className="pcab-step" aria-label="Больше" onClick={() => bumpProgress(goal.id, 5)}>
                    +
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        <div className="pcab-add-row" style={{ padding: "6px 6px 6px 14px", gap: 8 }}>
          <input
            value={newGoal}
            onChange={(e) => setNewGoal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addGoal();
              }
            }}
            placeholder="Добавить цель"
            className="pcab-inline-input"
            style={{ border: "none", background: "transparent", padding: "6px 0", textAlign: "center", color: "var(--pc-terracotta-dark)" }}
          />
          <button type="button" className="pcab-step" aria-label="Добавить цель" onClick={addGoal} style={{ borderColor: "var(--pc-terracotta)", color: "var(--pc-terracotta-dark)" }}>
            +
          </button>
        </div>

        {/* Методы */}
        <div className="pcab-section-head" style={{ margin: "20px 0 4px" }}>
          <span className="pcab-eyebrow">Методы</span>
        </div>
        <div className="pcab-methods" style={{ marginTop: 6 }}>
          {methods.map((method) => (
            <span key={method} className="pcab-tchip" style={{ padding: "7px 12px" }}>
              {method}
              <button
                type="button"
                className="pcab-chip-x"
                aria-label={`Убрать метод ${method}`}
                onClick={() => setMethods((prev) => prev.filter((m) => m !== method))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input
            value={newMethod}
            onChange={(e) => setNewMethod(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addMethod();
              }
            }}
            placeholder="+ метод"
            className="pcab-inline-input"
          />
          <button type="button" className="pcab-step" aria-label="Добавить метод" onClick={addMethod} style={{ width: 38, height: 38 }}>
            +
          </button>
        </div>

        {/* actionbar */}
        <div className="pcab-actionbar" style={{ marginTop: 20 }}>
          <button
            type="button"
            className="pcab-abtn pcab-abtn-ghost"
            onClick={() => {
              window.location.href = `/cabinet/practitioner/clients/${clientId}?tab=plan`;
            }}
          >
            Отмена
          </button>
          <button type="button" className="pcab-abtn pcab-abtn-primary" disabled={busy} onClick={save} data-testid="plan-edit-save-mobile">
            {busy ? (
              <Loader2 width={16} height={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
            Сохранить план
          </button>
        </div>
      </div>
    );
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
