"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
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

const scenarios = [
  {
    label: "Диалог ясности",
    title: "Начните с вопроса",
    text: "Короткий бережный диалог помогает отделить факты, чувства и предположения.",
  },
  {
    label: "Глубина",
    title: "Углубите ответ",
    text: "Ракурсы, отчет, переписка, совместимость или маршрут «7 дней к ясности».",
  },
  {
    label: "Следующий шаг",
    title: "Выберите опору",
    text: "Если нужен живой человек, специалист появляется после контекста, цены и формата.",
  },
];

export function HeroSection() {
  const [phIdx, setPhIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setPhIdx((i) => (i + 1) % PLACEHOLDERS.length), 4500);
    return () => clearInterval(t);
  }, []);

  return (
    <section
      data-testid="v5-home-hero"
      className="soft-hero"
      aria-labelledby="home-hero-title"
    >
      <div className="soft-shell">
        <div className="mx-auto max-w-[58rem] text-center">
          <div className="mb-5 flex flex-wrap items-center justify-center gap-3">
            <span className="soft-badge soft-badge-warm">Бесплатный первый разбор</span>
            <span className="text-sm text-[var(--soft-ink-faint)]">без регистрации до сохранения</span>
          </div>

          <h1 id="home-hero-title" className="soft-display">
            Не всегда первый вопрос — <span className="soft-italic">главный.</span>
          </h1>
          <p className="soft-lede mx-auto mt-6 max-w-2xl">
            Короткий, тёплый диалог помогает добраться до сути: что на самом
            деле тревожит, какие варианты есть и какой ближайший шаг возможен.
          </p>
        </div>

        <div className="soft-halo-stage mt-10">
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
                  Начать диалог
                  <ArrowRight className="size-4" aria-hidden="true" />
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="mx-auto mt-6 max-w-3xl text-center">
          <div className="soft-eyebrow mb-4">или выберите тему</div>
          <div className="soft-topic-cloud justify-center">
            {topics.map((topic) => (
              <Link
                key={topic}
                href={`/checkin?question=${encodeURIComponent(`${topic}: `)}`}
                className="soft-chip"
                data-analytics-event="dialogue_topic_clicked"
                data-analytics-target="/checkin"
              >
                {topic}
              </Link>
            ))}
          </div>
        </div>

        <div className="soft-map-grid mt-14">
          {scenarios.map((scenario, index) => (
            <article
              key={scenario.label}
              className="soft-card soft-step-card col-span-12 p-6 md:col-span-4"
            >
              <div className="flex items-start justify-between gap-4">
                <span className="soft-chip soft-chip-warm">{scenario.label}</span>
                <span className="font-heading text-2xl italic text-[var(--soft-terracotta-dark)]">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
              <h3 className="soft-h3 mt-5">{scenario.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                {scenario.text}
              </p>
            </article>
          ))}
        </div>

        <div className="mt-10 flex justify-center">
          <Link
            href="/products"
            className="soft-button soft-button-ghost"
            data-analytics-event="product_catalog_clicked"
            data-analytics-target="/products"
          >
            Посмотреть все сценарии
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
