"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, Loader2 } from "lucide-react";

type DialogueResponse = {
  dialogue?: {
    id: string;
    title: string;
    topic: string | null;
    difficulty: string | null;
    safetyLevel: string | null;
    clarifyingQuestions: string[];
  };
  error?: string;
};

const TOPIC_LABELS: Record<string, string> = {
  relationship: "отношения",
  career: "карьера",
  family: "семья",
  self: "самоопределение",
  anxiety: "тревога",
  money: "деньги",
  other: "другое",
};

function topicLabel(topic?: string | null) {
  if (!topic) return "контекст";
  return TOPIC_LABELS[topic] ?? topic;
}

export function PrecheckForm({
  practitionerId,
  practitionerSlug,
  practitionerName,
  profileHref,
}: {
  practitionerId: string;
  practitionerSlug: string;
  practitionerName: string;
  profileHref: string;
}) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DialogueResponse["dialogue"] | null>(null);

  useEffect(() => {
    const entryPath = `${window.location.pathname}${window.location.search}`;
    void fetch("/api/attribution/touch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "practitioner",
        channel: window.location.search.includes("widget=") ? "embedded-widget" : "precheck-link",
        entryPath,
        practitionerId,
        practitionerSlug,
        partnerId: new URLSearchParams(window.location.search).get("partner"),
        widgetId: new URLSearchParams(window.location.search).get("widget"),
        entryProduct: "practitioner_precheck",
      }),
      keepalive: true,
    }).catch(() => undefined);
  }, [practitionerId, practitionerSlug]);

  const bookingHref = useMemo(() => {
    const params = new URLSearchParams({
      precheck: result?.id ?? "new",
      practitioner: practitionerSlug,
      source: "practitioner_precheck",
    });
    return `${profileHref}?${params.toString()}`;
  }, [profileHref, practitionerSlug, result?.id]);

  async function submit() {
    const clean = question.replace(/\s+/g, " ").trim();
    if (clean.length < 12) {
      setError("Напишите чуть больше контекста: что произошло, что вы чувствуете и какой выбор стоит.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dialogues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: clean,
          metadata: {
            source: "practitioner_precheck",
            practitionerId,
            practitionerSlug,
            practitionerName,
          },
        }),
      });
      const data = await res.json() as DialogueResponse;
      if (!res.ok || !data.dialogue) {
        setError(data.error ?? "Не удалось собрать предразбор. Попробуйте ещё раз.");
        return;
      }
      setResult(data.dialogue);
      window.dispatchEvent(new CustomEvent("eterapy:analytics", {
        detail: {
          event: "practitioner_precheck_created",
          surface: "practitioner_precheck",
          practitionerId,
          practitionerSlug,
          dialogueId: data.dialogue.id,
        },
      }));
    } catch {
      setError("Сеть моргнула. Текст сохранён на экране, можно повторить отправку.");
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div className="soft-card p-5 md:p-6" data-testid="precheck-summary">
        <p className="soft-eyebrow">предразбор готов</p>
        <h2 className="soft-h2 mt-2">Уже есть короткая карта вопроса</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="soft-card-flat p-4">
            <p className="text-xs text-[var(--soft-ink-faint)]">Тема</p>
            <p className="mt-1 font-semibold text-[var(--soft-bordeaux)]">{topicLabel(result.topic)}</p>
          </div>
          <div className="soft-card-flat p-4">
            <p className="text-xs text-[var(--soft-ink-faint)]">Сложность</p>
            <p className="mt-1 font-semibold text-[var(--soft-bordeaux)]">{result.difficulty ?? "уточняется"}</p>
          </div>
          <div className="soft-card-flat p-4">
            <p className="text-xs text-[var(--soft-ink-faint)]">Рамка безопасности</p>
            <p className="mt-1 font-semibold text-[var(--soft-bordeaux)]">{result.safetyLevel ?? "обычная"}</p>
          </div>
        </div>

        {result.clarifyingQuestions.length > 0 && (
          <div className="mt-4 rounded-[var(--soft-radius-lg)] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-deep)] p-4">
            <p className="text-sm font-semibold text-[var(--soft-bordeaux)]">Что стоит принести на встречу</p>
            <ol className="mt-3 space-y-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
              {result.clarifyingQuestions.slice(0, 3).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </div>
        )}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Link href={bookingHref} className="soft-button soft-button-primary justify-center" data-testid="precheck-booking-continue">
            <CalendarDays className="size-4" aria-hidden="true" />
            Выбрать время у {practitionerName}
          </Link>
          <Link href="/checkin" className="soft-button soft-button-ghost justify-center">
            Продолжить общий диалог
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="soft-card p-5 md:p-6" data-testid="practitioner-precheck-form">
      <label htmlFor="precheck-question" className="soft-eyebrow">вопрос перед встречей</label>
      <textarea
        id="precheck-question"
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        maxLength={1600}
        className="mt-3 min-h-[180px] w-full resize-y rounded-[var(--soft-radius-lg)] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-deep)] px-4 py-3 text-base leading-relaxed text-[var(--soft-ink)] outline-none transition focus:border-[var(--soft-terracotta)]"
        placeholder="Например: мы постоянно возвращаемся к одному спору, я не понимаю, где моя часть ответственности и стоит ли идти в совместную сессию..."
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-relaxed text-[var(--soft-ink-faint)]">
          До 1600 знаков. Не отправляйте паспортные данные, карты и чужие личные контакты.
        </p>
        <span className="text-xs text-[var(--soft-ink-faint)]">{question.length}/1600</span>
      </div>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={loading}
        className="soft-button soft-button-primary mt-5 w-full justify-center"
      >
        {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="size-4" aria-hidden="true" />}
        Собрать предразбор
      </button>
    </div>
  );
}
