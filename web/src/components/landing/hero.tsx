"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { SoftHaloMark } from "@/components/brand/brand-mark";

const topics = [
  "Отношения",
  "Расставание",
  "Работа и призвание",
  "Семья",
  "Самооценка",
  "Тревога",
  "Деньги",
  "Родительство",
  "Дружба",
  "Одиночество",
];

const PLACEHOLDERS = [
  "Близкий человек молчит уже три дня — и я не понимаю, что с этим делать…",
  "Думаю об уходе из проекта уже год, но всё откладываю.",
  "Каждый разговор с родителями заканчивается одинаково.",
  "Снова тянет к человеку, с которым ничего не получается.",
];

export function HeroSection() {
  const [phIdx, setPhIdx] = useState(0);
  const [question, setQuestion] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const t = setInterval(() => setPhIdx((i) => (i + 1) % PLACEHOLDERS.length), 4500);
    return () => clearInterval(t);
  }, []);

  return (
    <section
      data-testid="v5-home-hero"
      className="soft-hero soft-hero-v42"
      aria-labelledby="home-hero-title"
    >
      <div className="soft-shell">
        <div className="mx-auto max-w-[54rem] text-center">
          <div className="mb-3 flex flex-wrap items-center justify-center gap-3">
            <span className="soft-badge soft-badge-warm">Бесплатный первый разбор</span>
            <span className="text-sm text-[var(--soft-ink-faint)]">· без регистрации</span>
          </div>

          <h1 id="home-hero-title" className="soft-display">
            Не всегда первый вопрос — <span className="soft-italic">главный.</span>
          </h1>
          <p className="soft-lede mx-auto mt-3 max-w-2xl">
            Короткий, тёплый диалог поможет добраться до сути и выбрать ближайший шаг.
          </p>
        </div>

        <div className="soft-halo-stage soft-halo-stage-compact mt-7">
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
                ref={textareaRef}
                id="home-question"
                name="question"
                rows={3}
                minLength={3}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
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
        </div>

        <div className="mx-auto mt-4 max-w-4xl text-center">
          <div className="soft-topic-cloud justify-center">
            <span className="self-center text-xs text-[var(--soft-ink-faint)]">или тема:</span>
            {topics.map((topic) => (
              <button
                key={topic}
                type="button"
                className="soft-chip soft-topic-chip-compact"
                data-analytics-event="dialogue_topic_clicked"
                data-analytics-target="/checkin"
                data-testid={`home-topic-${topic.toLowerCase().replace(/\s+/g, "-")}`}
                onClick={() => {
                  setQuestion(`${topic}: `);
                  requestAnimationFrame(() => textareaRef.current?.focus());
                }}
              >
                {topic}
              </button>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}
