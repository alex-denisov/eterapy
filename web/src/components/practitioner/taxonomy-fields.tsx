"use client";

import { useState } from "react";
import {
  CATEGORIES,
  directionsForCategories,
  tasksForCategories,
  categoryIdForDirection,
} from "@/lib/practitioner-taxonomy";

export interface TaxonomyValue {
  categories: string[];
  directions: string[];
  tasks: string[];
}

interface TaxonomyFieldsProps {
  value: TaxonomyValue;
  onChange: (next: TaxonomyValue) => void;
  /** compact styling for the admin modal */
  dense?: boolean;
}

/**
 * W3: shared three-level taxonomy editor used by the practitioner profile editor
 * (cabinet) and the admin user-management modal. One source of truth, one UI,
 * so the hierarchy stays in sync everywhere.
 *
 *   1. Специализация (categories) — multi-select chips.
 *   2. Направление (directions)   — chips scoped to the chosen categories.
 *   3. Задачи (tasks)             — suggested chips + free-text.
 */
export function PractitionerTaxonomyFields({ value, onChange, dense = false }: TaxonomyFieldsProps) {
  const [draft, setDraft] = useState("");

  const availableDirections = directionsForCategories(value.categories);
  const suggestedTasks = tasksForCategories(value.categories);

  const chip = (active: boolean) =>
    dense
      ? `rounded-md border px-2.5 py-1 text-xs transition-colors ${
          active
            ? "border-[var(--soft-bordeaux)] bg-[var(--soft-bordeaux)]/10 text-[var(--soft-bordeaux)] font-medium"
            : "border-[var(--soft-paper-edge)] text-[var(--soft-ink-soft)] hover:border-[var(--soft-ink-faint)]"
        }`
      : `rounded-lg border px-3 py-1.5 text-sm transition-colors ${
          active
            ? "border-[var(--soft-bordeaux)]/45 soft-select-pill font-medium"
            : "border-border/30 text-[var(--soft-ink-soft)] hover:border-border/60"
        }`;

  const heading = dense
    ? "text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--soft-ink-soft)]"
    : "font-semibold mb-1";

  function toggleCategory(id: string) {
    const has = value.categories.includes(id);
    const categories = has ? value.categories.filter((c) => c !== id) : [...value.categories, id];
    // prune directions that no longer belong to any selected category
    const directions = has
      ? value.directions.filter((d) => {
          const cat = categoryIdForDirection(d);
          return cat ? categories.includes(cat) : true;
        })
      : value.directions;
    onChange({ ...value, categories, directions });
  }

  function toggleDirection(id: string) {
    const directions = value.directions.includes(id)
      ? value.directions.filter((d) => d !== id)
      : [...value.directions, id];
    onChange({ ...value, directions });
  }

  function toggleTask(task: string) {
    const tasks = value.tasks.includes(task)
      ? value.tasks.filter((t) => t !== task)
      : [...value.tasks, task];
    onChange({ ...value, tasks });
  }

  function commitDraft() {
    const parts = draft
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const merged = [...value.tasks];
    for (const p of parts) {
      if (!merged.some((t) => t.toLocaleLowerCase("ru-RU") === p.toLocaleLowerCase("ru-RU"))) merged.push(p);
    }
    onChange({ ...value, tasks: merged });
    setDraft("");
  }

  const customTasks = value.tasks.filter(
    (t) => !suggestedTasks.some((s) => s.toLocaleLowerCase("ru-RU") === t.toLocaleLowerCase("ru-RU")),
  );

  return (
    <div className={dense ? "space-y-3" : "space-y-5"}>
      {/* Level 1 — Специализация */}
      <div>
        <p className={heading}>Специализация</p>
        {!dense && (
          <p className="text-xs text-[var(--soft-ink-soft)]/60 mb-2">
            Главная категория. Влияет на фильтры каталога и показ в карточке. Те же категории видит администратор.
          </p>
        )}
        <div className={`flex flex-wrap gap-1.5 ${dense ? "mt-1" : "mt-1"}`}>
          {CATEGORIES.map((c) => (
            <button key={c.id} type="button" onClick={() => toggleCategory(c.id)}
              className={chip(value.categories.includes(c.id))} aria-pressed={value.categories.includes(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Level 2 — Направление */}
      {availableDirections.length > 0 && (
        <div>
          <p className={heading}>Направление</p>
          {!dense && (
            <p className="text-xs text-[var(--soft-ink-soft)]/60 mb-2">
              Школа или область практики внутри выбранной специализации.
            </p>
          )}
          <div className="mt-1 flex flex-wrap gap-1.5">
            {availableDirections.map((d) => (
              <button key={d.id} type="button" onClick={() => toggleDirection(d.id)}
                className={chip(value.directions.includes(d.id))} aria-pressed={value.directions.includes(d.id)}>
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Level 3 — Задачи */}
      <div>
        <p className={heading}>Задачи {dense ? "" : <span className="text-xs font-normal text-[var(--soft-ink-soft)]/60">(с чем помогаете)</span>}</p>
        {!dense && (
          <p className="text-xs text-[var(--soft-ink-soft)]/60 mb-2">
            Конкретные запросы, с которыми вы работаете. Используются для подбора специалиста после диалога ясности.
          </p>
        )}
        {suggestedTasks.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {suggestedTasks.map((t) => (
              <button key={t} type="button" onClick={() => toggleTask(t)}
                className={chip(value.tasks.includes(t))} aria-pressed={value.tasks.includes(t)}>
                {t}
              </button>
            ))}
          </div>
        )}
        {customTasks.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {customTasks.map((t) => (
              <button key={t} type="button" onClick={() => toggleTask(t)}
                className={`${chip(true)} inline-flex items-center gap-1`}>
                {t} <span aria-hidden>×</span>
              </button>
            ))}
          </div>
        )}
        <div className="mt-2 flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commitDraft(); }
            }}
            onBlur={commitDraft}
            placeholder="Добавить свою задачу…"
            className={`flex-1 rounded-md border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] px-2.5 ${dense ? "h-9 text-sm" : "h-10 text-sm"} text-[var(--soft-ink-strong)]`}
          />
        </div>
      </div>
    </div>
  );
}
