"use client";

import { useState } from "react";
import { Check, ChevronDown, Send, ShieldCheck } from "lucide-react";

// G8 · Жалоба или нарушение.
//
// A complaint is a structured support message: category + description POSTed to
// /api/support/messages, which stores it for the first-party support console.
// The reply lands in the in-cabinet support chat — no email round-trip.
//
// N1a: the whole form stays collapsed behind a trigger until the user opens it,
// so the support page isn't dominated by a big form by default.
// N1b/N1c: the category select and the textarea use a normal bordered field
// style (FIELD_CLASS) instead of the giant hero question input, and the textarea
// shows a live character counter.

const CATEGORIES = [
  { value: "specialist", label: "Поведение специалиста" },
  { value: "payment", label: "Оплата или возврат" },
  { value: "privacy", label: "Приватность данных" },
  { value: "other", label: "Другое" },
] as const;

type CategoryValue = (typeof CATEGORIES)[number]["value"];

const CATEGORY_LABEL: Record<CategoryValue, string> = {
  specialist: "Поведение специалиста",
  payment: "Оплата или возврат",
  privacy: "Приватность данных",
  other: "Другое",
};

const DETAILS_MIN = 10;
const DETAILS_MAX = 1000;

const FIELD_CLASS =
  "mt-1 w-full rounded-[var(--soft-radius-lg)] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] px-3 py-2 text-sm text-[var(--soft-ink)] transition-colors focus:bg-white focus:outline-none";

export function ComplaintForm() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<CategoryValue>("specialist");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const trimmed = details.trim();
    if (submitting) return;
    if (trimmed.length < DETAILS_MIN) {
      setError("Опишите ситуацию подробнее — хотя бы пару предложений.");
      return;
    }
    setSubmitting(true);
    setError(null);

    // Prefix with the category so support staff triages from the first line.
    const content = `[Жалоба · ${CATEGORY_LABEL[category]}]\n\n${trimmed}`;
    try {
      const res = await fetch("/api/support/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Не удалось отправить жалобу");
      }
      setDone(true);
      setDetails("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Ошибка отправки");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="soft-card p-6" data-testid="cabinet-support-complaint">
        <Check className="size-5 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
        <h2 className="soft-h3 mt-3">Жалоба отправлена</h2>
        <p className="mt-2 text-sm text-[var(--soft-ink-soft)]">
          Мы изучим ситуацию и ответим в чате поддержки ниже — обычно в течение 4 часов в будние дни.
          Отдельно писать на email не нужно.
        </p>
        <button
          type="button"
          onClick={() => {
            setDone(false);
            setOpen(true);
          }}
          className="soft-button soft-button-ghost mt-4 h-9 px-4 text-sm"
          data-testid="cabinet-support-complaint-reset"
        >
          Отправить ещё одну
        </button>
      </div>
    );
  }

  // N1a: collapsed trigger — the form expands only when the user wants it.
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="soft-card flex w-full items-center justify-between gap-3 p-5 text-left transition-colors hover:bg-[var(--soft-surface)]"
        data-testid="cabinet-support-complaint-trigger"
      >
        <span className="flex items-center gap-3">
          <ShieldCheck className="size-5 shrink-0 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
          <span>
            <span className="soft-h3 block">Сообщить о проблеме</span>
            <span className="mt-1 block text-sm text-[var(--soft-ink-soft)]">
              Поведение специалиста, оплата, приватность — опишите ситуацию, ответим в чате ниже.
            </span>
          </span>
        </span>
        <ChevronDown className="size-5 shrink-0 text-[var(--soft-ink-faint)]" aria-hidden="true" />
      </button>
    );
  }

  return (
    <div className="soft-card p-6" data-testid="cabinet-support-complaint">
      <ShieldCheck className="size-5 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
      <h2 className="soft-h3 mt-3">Жалоба или нарушение</h2>
      <p className="mt-2 text-sm text-[var(--soft-ink-soft)]">
        Если специалист повёл себя некорректно, оплата зависла или нарушена приватность — опишите
        ситуацию. Ответ придёт в чат поддержки ниже, на email писать не нужно.
      </p>

      <label className="mt-4 block max-w-sm text-sm">
        <span className="text-[var(--soft-ink-soft)]">Категория</span>
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value as CategoryValue)}
          className={FIELD_CLASS}
          data-testid="cabinet-support-complaint-category"
        >
          {CATEGORIES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-4 block text-sm">
        <span className="text-[var(--soft-ink-soft)]">Что случилось</span>
        <textarea
          value={details}
          onChange={(event) => setDetails(event.target.value.slice(0, DETAILS_MAX))}
          placeholder="Опишите: что произошло, когда, какой специалист или заказ, чем мы можем помочь."
          className={`${FIELD_CLASS} resize-none leading-relaxed`}
          rows={5}
          maxLength={DETAILS_MAX}
          disabled={submitting}
          data-testid="cabinet-support-complaint-details"
        />
        <span className="mt-1 block text-right text-xs text-[var(--soft-ink-faint)]" data-testid="cabinet-support-complaint-counter">
          {details.length} / {DETAILS_MAX}
        </span>
      </label>

      {error && (
        <p className="mt-1 text-xs text-[var(--soft-bordeaux)]" data-testid="cabinet-support-complaint-error">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={submitting || details.trim().length < DETAILS_MIN}
          className="soft-button soft-button-primary h-9 px-4 text-sm"
          data-testid="cabinet-support-complaint-submit"
        >
          <Send className="size-4" aria-hidden="true" />
          Отправить жалобу
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={submitting}
          className="soft-button soft-button-ghost h-9 px-4 text-sm"
          data-testid="cabinet-support-complaint-cancel"
        >
          Свернуть
        </button>
      </div>
    </div>
  );
}
