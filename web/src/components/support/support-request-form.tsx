"use client";

import { useState } from "react";
import { Check, Send } from "lucide-react";
import { SUPPORT_CATEGORIES } from "@/lib/support-faq";

// B464 round-5 #13 — «Заполнить форму»: inline веб-форма обращения из
// эскалационных карточек центра поддержки. Категории — единый список тем
// поддержки; текст 20–1000 символов; отправка создаёт НОВУЮ сессию поддержки,
// ответ приходит в чат на этой же странице.

const DETAILS_MIN = 20;
const DETAILS_MAX = 1000;

const FIELD_CLASS =
  "mt-1 w-full rounded-[var(--soft-radius-lg)] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] px-3 py-2 text-sm text-[var(--soft-ink)] transition-colors focus:bg-white focus:outline-none";

export function SupportRequestForm({ defaultCategory }: { defaultCategory?: string | null }) {
  const [category, setCategory] = useState<string>(
    defaultCategory && SUPPORT_CATEGORIES.some((c) => c.id === defaultCategory)
      ? defaultCategory
      : SUPPORT_CATEGORIES[0].id,
  );
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const trimmed = details.trim();
    if (submitting) return;
    if (trimmed.length < DETAILS_MIN) {
      setError(`Опишите ситуацию подробнее — минимум ${DETAILS_MIN} символов.`);
      return;
    }
    setSubmitting(true);
    setError(null);

    const label = SUPPORT_CATEGORIES.find((c) => c.id === category)?.label ?? "Другое";
    const content = `[Обращение · ${label}]\n\n${trimmed}`;
    try {
      const res = await fetch("/api/support/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, newSession: true }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Не удалось отправить обращение");
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
      <div className="rounded-[14px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-5" data-testid="support-request-done">
        <p className="flex items-center gap-2 text-sm font-semibold text-[var(--soft-ink)]">
          <Check className="size-4 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
          Обращение отправлено
        </p>
        <p className="mt-2 text-sm text-[var(--soft-ink-soft)]">
          Ответим обычно в течение 4 часов в будние дни — ответ появится в чате
          поддержки на этой странице и придёт на вашу почту.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[14px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-5" data-testid="support-request-form">
      <label className="block max-w-sm text-sm">
        <span className="text-[var(--soft-ink-soft)]">Категория</span>
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className={FIELD_CLASS}
          data-testid="support-request-category"
        >
          {SUPPORT_CATEGORIES.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-4 block text-sm">
        <span className="text-[var(--soft-ink-soft)]">Опишите вопрос</span>
        <textarea
          value={details}
          onChange={(event) => setDetails(event.target.value.slice(0, DETAILS_MAX))}
          placeholder="Что произошло, когда, какой заказ или специалист — и чем мы можем помочь."
          className={`${FIELD_CLASS} resize-none leading-relaxed`}
          rows={5}
          maxLength={DETAILS_MAX}
          disabled={submitting}
          data-testid="support-request-details"
        />
        <span className="mt-1 block text-right text-xs text-[var(--soft-ink-faint)]" data-testid="support-request-counter">
          {details.length} / {DETAILS_MAX} · минимум {DETAILS_MIN}
        </span>
      </label>

      {error && (
        <p className="mt-1 text-xs text-[var(--soft-bordeaux)]" data-testid="support-request-error">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => void submit()}
        disabled={submitting || details.trim().length < DETAILS_MIN}
        className="soft-button soft-button-primary mt-4 h-9 px-4 text-sm"
        data-testid="support-request-submit"
      >
        <Send className="size-4" aria-hidden="true" />
        Отправить
      </button>
    </div>
  );
}
