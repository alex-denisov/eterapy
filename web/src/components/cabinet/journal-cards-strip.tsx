"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";

// B512 R1-8 (owner 2026-07-15) — «ваши записи» Дневника: последние 7 дней
// компактными квадратными карточками в один ряд (как календарь с заданными
// вопросами); клик по карточке показывает её содержимое (вопрос · взгляд дня ·
// маленький шаг) в панели снизу, переключение карточек меняет контент.

export interface JournalStripEntry {
  id: string;
  /** «14» — день месяца для крупной цифры карточки. */
  dayLabel: string;
  /** «июл» — короткий месяц. */
  monthLabel: string;
  /** «понедельник, 14 июля» — заголовок панели. */
  fullDateLabel: string;
  question: string;
  own: boolean;
  perspective: string | null;
  step: string | null;
}

export function JournalCardsStrip({ entries }: { entries: JournalStripEntry[] }) {
  const [activeId, setActiveId] = useState<string | null>(entries[0]?.id ?? null);
  const active = entries.find((entry) => entry.id === activeId) ?? null;

  if (entries.length === 0) return null;

  return (
    <div data-testid="diary-journal-strip">
      {/* Полоса карточек: на десктопе ряд, на мобиле — горизонтальный скролл. */}
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Последние записи">
        {entries.map((entry) => {
          const isActive = entry.id === activeId;
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveId(entry.id)}
              data-testid="diary-journal-card"
              data-active={isActive ? "1" : "0"}
              className="flex aspect-square w-[76px] min-w-[76px] flex-col items-center justify-center gap-0.5 rounded-[14px] border p-2 text-center transition-colors sm:w-[86px] sm:min-w-0 sm:flex-1"
              style={
                isActive
                  ? { borderColor: "var(--soft-terracotta)", background: "var(--soft-apricot)", boxShadow: "0 10px 24px -18px rgba(92,42,44,.5)" }
                  : { borderColor: "var(--soft-paper-edge)", background: "var(--soft-paper-card)" }
              }
              title={entry.question}
            >
              <span
                className="font-heading text-[22px] font-semibold leading-none"
                style={{ color: "var(--soft-bordeaux)" }}
              >
                {entry.dayLabel}
              </span>
              <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--soft-ink-faint)" }}>
                {entry.monthLabel}
              </span>
              <span className="mt-0.5 flex items-center gap-1 text-[9.5px]" style={{ color: isActive ? "var(--soft-terracotta-dark)" : "var(--soft-ink-faint)" }}>
                {entry.own ? "ваш вопрос" : "вопрос дня"}
              </span>
            </button>
          );
        })}
      </div>

      {/* Панель контента выбранной карточки. */}
      {active && (
        <div
          className="mt-3 rounded-[14px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4"
          data-testid="diary-journal-detail"
          role="tabpanel"
        >
          <p className="text-[11.5px]" style={{ color: "var(--soft-ink-faint)" }}>
            {active.fullDateLabel} · {active.own ? "ваш вопрос" : "вопрос дня"}
          </p>
          <p className="soft-italic mt-1" style={{ fontSize: 16, color: "var(--soft-bordeaux)", lineHeight: 1.4 }}>
            «{active.question}»
          </p>
          {(active.perspective || active.step) ? (
            <div className="mt-3 grid gap-3 border-t border-[var(--soft-paper-edge)] pt-3 sm:grid-cols-2">
              {active.perspective && (
                <div>
                  <p className="soft-eyebrow">взгляд дня</p>
                  <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>{active.perspective}</p>
                </div>
              )}
              {active.step && (
                <div>
                  <p className="soft-eyebrow">маленький шаг</p>
                  <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>{active.step}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="mt-2 flex items-center gap-1.5 text-[12.5px]" style={{ color: "var(--soft-ink-faint)" }}>
              <Sparkles className="size-3.5 shrink-0" aria-hidden="true" />
              В этот день вы отметили практику без развёрнутого ответа.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
