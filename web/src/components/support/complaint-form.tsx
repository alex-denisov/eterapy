"use client";

import { useState } from "react";
import { Check, Send, ShieldCheck } from "lucide-react";

// G8 · Жалоба или нарушение.
//
// Replaces the old mailto:safety@ card. A complaint is just a structured
// support message: we capture a category + description and POST it to the
// existing /api/support/messages pipeline, which stores it in the DB and
// forwards it to the support Telegram group.
//
// On the "форма без email" concern: this form lives in the authenticated
// cabinet, so the account IS the return address. The reply lands in the
// in-cabinet support chat below — no email round-trip, nothing anonymous
// that staff couldn't answer.

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
const DETAILS_MAX = 2000;

export function ComplaintForm() {
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
          onClick={() => setDone(false)}
          className="soft-button soft-button-ghost mt-4 h-9 px-4 text-sm"
          data-testid="cabinet-support-complaint-reset"
        >
          Отправить ещё одну
        </button>
      </div>
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

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-[var(--soft-ink-soft)]">Категория</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as CategoryValue)}
            className="soft-question-input mt-1 w-full"
            data-testid="cabinet-support-complaint-category"
          >
            {CATEGORIES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="mt-4 block text-sm">
        <span className="text-[var(--soft-ink-soft)]">Что случилось</span>
        <textarea
          value={details}
          onChange={(event) => setDetails(event.target.value.slice(0, DETAILS_MAX))}
          placeholder="Опишите: что произошло, когда, какой специалист или заказ, чем мы можем помочь."
          className="soft-question-input mt-1 w-full resize-none"
          rows={4}
          maxLength={DETAILS_MAX}
          disabled={submitting}
          data-testid="cabinet-support-complaint-details"
        />
      </label>

      {error && (
        <p className="mt-2 text-xs text-[var(--soft-bordeaux)]" data-testid="cabinet-support-complaint-error">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => void submit()}
        disabled={submitting || details.trim().length < DETAILS_MIN}
        className="soft-button soft-button-primary mt-4 h-9 px-4 text-sm"
        data-testid="cabinet-support-complaint-submit"
      >
        <Send className="size-4" aria-hidden="true" />
        Отправить жалобу
      </button>
    </div>
  );
}
