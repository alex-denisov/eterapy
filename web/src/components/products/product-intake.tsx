"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

type IntakeMode = "full" | "light";

type DialoguePayload = {
  id: string;
  status: "OPEN" | "AWAITING_USER" | "PROCESSING" | "ANSWERED" | "SAFETY_INTERRUPTED" | "ARCHIVED" | "DELETED";
  safety?: {
    level: string;
    reason: string;
    interrupt: boolean;
  };
  clarifyingQuestions?: Array<{ question: string; chips?: string[] }>;
};

type ProductIntakeProps = {
  productKey: string;
  mode: IntakeMode;
  title: string;
  description: string;
  promptLabel?: string;
  placeholder?: string;
  submitLabel?: string;
  readyLabel?: string;
  className?: string;
  testId?: string;
  onContextReady?: (dialogueId: string) => void;
};

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "Не удалось выполнить запрос");
  }
  return data as T;
}

function defaultReadyRedirect(dialogueId: string, router: ReturnType<typeof useRouter>) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("dialogueId", dialogueId);
  url.searchParams.delete("question");
  router.replace(`${url.pathname}${url.search}`);
  router.refresh();
}

export function ProductIntake({
  productKey,
  mode,
  title,
  description,
  promptLabel = "Ваш контекст",
  placeholder = "Опишите ситуацию своими словами: что происходит, что вы уже пробовали, где сейчас главный вопрос?",
  submitLabel = "Продолжить",
  readyLabel = "Контекст готов",
  className = "",
  testId = "product-intake",
  onContextReady,
}: ProductIntakeProps) {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [dialogue, setDialogue] = useState<DialoguePayload | null>(null);
  const [clarifyingQuestions, setClarifyingQuestions] = useState<Array<{ question: string; chips?: string[] }>>([]);
  const [clarifyingAnswers, setClarifyingAnswers] = useState<string[]>([]);
  const [answer, setAnswer] = useState("");
  const [phase, setPhase] = useState<"idle" | "clarifying" | "ready" | "safety" | "loading">("idle");
  const [error, setError] = useState("");

  const currentQuestion = useMemo(() => {
    if (clarifyingQuestions.length === 0) return null;
    return clarifyingQuestions[Math.min(clarifyingAnswers.length, clarifyingQuestions.length - 1)] ?? null;
  }, [clarifyingAnswers.length, clarifyingQuestions]);

  function finish(dialogueId: string) {
    setPhase("ready");
    if (onContextReady) {
      onContextReady(dialogueId);
      return;
    }
    defaultReadyRedirect(dialogueId, router);
  }

  async function startIntake() {
    const text = question.trim();
    if (text.length < 3) return;
    setError("");
    setPhase("loading");
    setDialogue(null);
    setClarifyingAnswers([]);
    setClarifyingQuestions([]);

    try {
      const data = await requestJson<{ dialogue: DialoguePayload }>("/api/dialogues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text,
          intakeProductKey: productKey,
          intakeMode: mode,
        }),
      });
      setDialogue(data.dialogue);
      if (data.dialogue.status === "SAFETY_INTERRUPTED" || data.dialogue.safety?.interrupt) {
        setPhase("safety");
        return;
      }
      const questions = data.dialogue.clarifyingQuestions?.filter((item) => item.question.trim()) ?? [];
      if (mode === "light" || data.dialogue.status === "PROCESSING" || questions.length === 0) {
        finish(data.dialogue.id);
        return;
      }
      setClarifyingQuestions(questions);
      setPhase("clarifying");
    } catch (err) {
      setPhase("idle");
      setError(err instanceof Error ? err.message : "Не удалось начать сбор контекста");
    }
  }

  async function sendClarification(skipAll = false, chip?: string) {
    if (!dialogue) return;
    const text = skipAll ? "" : (chip ?? answer.trim());
    if (!skipAll && text.length < 1) return;
    setError("");
    setPhase("loading");

    try {
      const data = await requestJson<{
        dialogue: DialoguePayload;
        nextQuestion?: { question: string; chips?: string[] } | null;
      }>(`/api/dialogues/${dialogue.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(skipAll ? { action: "skip_clarifications" } : { message: text }),
      });

      if (!skipAll) setClarifyingAnswers((items) => [...items, text]);
      setAnswer("");
      setDialogue(data.dialogue);

      if (data.nextQuestion?.question) {
        setClarifyingQuestions((items) => [...items, data.nextQuestion!]);
        setPhase("clarifying");
        return;
      }
      finish(data.dialogue.id);
    } catch (err) {
      setPhase("clarifying");
      setError(err instanceof Error ? err.message : "Не удалось отправить уточнение");
    }
  }

  const disabled = phase === "loading";

  return (
    <div
      id={`product-intake-${productKey}`}
      className={`soft-card soft-form-panel mt-8 ${className}`}
      data-testid={testId}
      data-product-key={productKey}
      data-intake-mode={mode}
    >
      <p className="soft-eyebrow">контекст услуги</p>
      <h2 className="soft-h3 mt-3">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{description}</p>

      {phase === "idle" && (
        <div className="mt-5 grid gap-3">
          <label className="soft-eyebrow" htmlFor={`product-intake-question-${productKey}`}>{promptLabel}</label>
          <textarea
            id={`product-intake-question-${productKey}`}
            value={question}
            onChange={(event) => setQuestion(event.target.value.slice(0, 1200))}
            placeholder={placeholder}
            rows={mode === "light" ? 5 : 6}
            className="soft-question-input py-3 text-sm"
            disabled={disabled}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={() => void startIntake()}
              disabled={disabled || question.trim().length < 3}
              className="soft-button soft-button-primary"
            >
              {disabled ? "Собираем контекст" : submitLabel}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
            <span className="text-xs text-[var(--soft-ink-faint)]">{question.length}/1200</span>
          </div>
        </div>
      )}

      {phase === "clarifying" && currentQuestion && (
        <div className="mt-5 grid gap-4" data-testid="product-intake-clarifying">
          <div className="rounded-[var(--soft-radius-lg)] bg-[var(--soft-paper-deep)] p-4">
            <p className="soft-eyebrow">уточнение</p>
            <p className="mt-2 font-heading text-lg italic leading-relaxed text-[var(--soft-bordeaux)]">
              {currentQuestion.question}
            </p>
          </div>
          {currentQuestion.chips && currentQuestion.chips.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {currentQuestion.chips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className="soft-chip"
                  onClick={() => void sendClarification(false, chip)}
                  disabled={disabled}
                >
                  {chip}
                </button>
              ))}
            </div>
          )}
          <textarea
            value={answer}
            onChange={(event) => setAnswer(event.target.value.slice(0, 1200))}
            placeholder="Ответьте коротко или подробнее — как удобно."
            rows={4}
            className="soft-question-input py-3 text-sm"
            disabled={disabled}
          />
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={() => void sendClarification(false)}
              disabled={disabled || answer.trim().length < 1}
              className="soft-button soft-button-primary"
            >
              Отправить
              <Send className="size-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              onClick={() => void sendClarification(true)}
              disabled={disabled}
              className="soft-button soft-button-ghost"
            >
              Достаточно контекста
            </Button>
          </div>
        </div>
      )}

      {phase === "loading" && (
        <p className="mt-5 rounded-[var(--soft-radius-lg)] bg-[var(--soft-paper-deep)] p-4 text-sm text-[var(--soft-ink-soft)]">
          Сверяем контекст...
        </p>
      )}

      {phase === "ready" && (
        <p className="mt-5 flex items-center gap-2 rounded-[var(--soft-radius-lg)] bg-[var(--soft-paper-deep)] p-4 text-sm text-[var(--soft-bordeaux)]">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          {readyLabel}
        </p>
      )}

      {phase === "safety" && (
        <p className="mt-5 rounded-[var(--soft-radius-lg)] bg-[var(--soft-paper-deep)] p-4 text-sm leading-relaxed text-[var(--soft-bordeaux)]">
          Похоже, тема может быть небезопасной для автоматического углубления. Лучше обратиться к живой поддержке или экстренным службам, если есть риск для жизни и здоровья.
        </p>
      )}

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
    </div>
  );
}
