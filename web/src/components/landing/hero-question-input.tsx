"use client";

import { useState, useEffect } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { SoftHaloMark } from "@/components/brand/brand-mark";

const PLACEHOLDERS = [
  "Близкий человек молчит уже три дня — и я не понимаю, что с этим делать…",
  "Думаю об уходе из проекта уже год, но всё откладываю.",
  "Каждый разговор с родителями заканчивается одинаково.",
  "Снова тянет к человеку, с которым ничего не получается.",
];

export function HeroQuestionInput() {
  const [phIdx, setPhIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setPhIdx((i) => (i + 1) % PLACEHOLDERS.length), 4500);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="soft-ask-card" data-testid="v5-question-entry">
      <div className="mb-3 flex items-center gap-2">
        <SoftHaloMark size={14} />
        <span className="soft-eyebrow">Диалог ясности</span>
      </div>
      <form action="/checkin" data-testid="question-entry">
        <label htmlFor="home-question" className="sr-only">
          Что сейчас хочется понять?
        </label>
        <textarea
          id="home-question"
          name="question"
          rows={3}
          minLength={3}
          placeholder={PLACEHOLDERS[phIdx]}
          className="soft-question-input"
          data-testid="home-question-input"
        />
        <div className="soft-ask-foot">
          <div className="flex items-center gap-2 text-sm text-[var(--soft-ink-faint)]">
            <LockKeyhole className="size-4" aria-hidden="true" />
            <span>Приватно. Не публикуется без согласия.</span>
          </div>
          <button
            type="submit"
            className="soft-button soft-button-primary"
            data-analytics-event="dialogue_cta_clicked"
            data-analytics-target="/checkin"
            data-testid="home-dialogue-cta"
          >
            Получить разбор
            <ArrowRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      </form>
    </div>
  );
}
