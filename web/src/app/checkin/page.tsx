"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  ArrowRight,
  Bookmark,
  CalendarDays,
  CheckCircle2,
  Compass,
  FileText,
  Heart,
  Loader2,
  MessageSquareText,
  Moon,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { AIShareButton } from "@/components/ai-share-button";
import { DialogueShell } from "@/components/dialogue/dialogue-shell";
import { Button } from "@/components/ui/button";
import { Disclaimer } from "@/components/ui/disclaimer";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { persistGuestResultDraftToAccount, saveGuestResultDraft } from "@/lib/guest-result-cache";
import { track } from "@/lib/analytics";

type DialogueMessage = {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  createdAt: string;
};

type PractitionerRecommendation = {
  id: string;
  slug: string;
  name: string | null;
  title: string;
  bio: string | null;
  avatar: string | null;
  pricePerSession: number;
  rating: number;
  reviewCount: number;
  rationale: string;
};

type DialoguePayload = {
  id: string;
  title: string;
  status: "OPEN" | "AWAITING_USER" | "PROCESSING" | "ANSWERED" | "SAFETY_INTERRUPTED" | "ARCHIVED" | "DELETED";
  topic?: string | null;
  difficulty?: string | null;
  safetyLevel?: string | null;
  safety?: {
    level: string;
    reason: string;
    interrupt: boolean;
  };
  clarifyingQuestions?: string[];
  primaryAnswer?: {
    id: string;
    content: string;
    createdAt: string;
  } | null;
  messages: DialogueMessage[];
  createdAt: string;
  updatedAt: string;
};

const processingLines = [
  "Собираю контекст в один ответ",
  "Отделяю главное от шума",
  "Формулирую бережный следующий шаг",
];

const suggestedClarificationAnswers = [
  "Острая ситуация прямо сейчас",
  "Это давняя тема",
  "Хочу понять, что происходит",
  "Хочу решить, что делать",
  "И то, и другое",
  "Пока сложно сформулировать",
];

function cleanAnswer(text: string) {
  return text.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1").trim();
}

export default function CheckinPage() {
  const { status } = useSession();
  const [question, setQuestion] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("question")?.slice(0, 4000) ?? "";
  });
  const [clarification, setClarification] = useState("");
  const [clarifyingAnswers, setClarifyingAnswers] = useState<string[]>([]);
  const [dialogue, setDialogue] = useState<DialoguePayload | null>(null);
  const [phase, setPhase] = useState<"question" | "clarifying" | "processing" | "result" | "safety">("question");
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [retrying, setRetrying] = useState(false);
  const [recommendations, setRecommendations] = useState<PractitionerRecommendation[]>([]);
  const [restoring, setRestoring] = useState(() => {
    if (typeof window === "undefined") return false;
    return Boolean(new URLSearchParams(window.location.search).get("dialogueId"));
  });
  const autoStartedRef = useRef(false);

  const primaryAnswer = dialogue?.primaryAnswer?.content
    ?? [...(dialogue?.messages ?? [])].reverse().find((message) => message.role === "ASSISTANT" && dialogue?.status === "ANSWERED")?.content
    ?? "";
  const safeAnswer = useMemo(() => cleanAnswer(primaryAnswer), [primaryAnswer]);
  const clarifyingQuestions = useMemo(() => {
    const questions = dialogue?.clarifyingQuestions?.filter((item) => item.trim()) ?? [];
    return questions.length > 0 ? questions : ["Что важно добавить, чтобы первичный ответ был точнее?"];
  }, [dialogue?.clarifyingQuestions]);
  const currentClarifyingQuestion = clarifyingQuestions[Math.min(clarifyingAnswers.length, clarifyingQuestions.length - 1)];

  useEffect(() => {
    if (phase === "result" || phase === "safety") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== "result" || !dialogue?.id) return;
    track({ event: "primary_answer_viewed", surface: "checkin", dialogueId: dialogue.id });
    let cancelled = false;
    fetch(`/api/dialogues/${dialogue.id}/recommendations`)
      .then((res) => res.ok ? res.json() : Promise.reject())
      .then((data: { recommendations: PractitionerRecommendation[] }) => {
        if (!cancelled && Array.isArray(data.recommendations)) {
          setRecommendations(data.recommendations);
          if (data.recommendations.length > 0) {
            track({ event: "specialist_recommended", surface: "checkin", dialogueId: dialogue.id, properties: { count: data.recommendations.length } });
          }
        }
      })
      .catch(() => { /* silent — recommendations are best-effort */ });
    return () => { cancelled = true; };
  }, [phase, dialogue?.id]);

  useEffect(() => {
    const dialogueId = new URLSearchParams(window.location.search).get("dialogueId");
    if (!dialogueId) return;
    let cancelled = false;

    async function restoreDialogue() {
      setError("");
      setRestoring(true);
      try {
        const response = await fetch(`/api/dialogues/${dialogueId}`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Диалог не найден");
        if (cancelled) return;
        const restored = data.dialogue as DialoguePayload;
        setDialogue(restored);
        setQuestion(restored.messages.find((message) => message.role === "USER")?.content ?? restored.title);
        setClarifyingAnswers([]);
        setClarification("");
        setPhase(
          restored.status === "ANSWERED"
            ? "result"
            : restored.status === "SAFETY_INTERRUPTED"
              ? "safety"
              : restored.status === "AWAITING_USER"
                ? "clarifying"
                : "processing",
        );
      } catch (err) {
        if (!cancelled) {
          setPhase("question");
          setError(err instanceof Error ? err.message : "Не удалось восстановить диалог");
        }
      } finally {
        if (!cancelled) setRestoring(false);
      }
    }

    void restoreDialogue();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveDraft = useCallback((answer: string, currentDialogue: DialoguePayload) => {
    saveGuestResultDraft({
      tool: "CHECKIN",
      title: "Первичный ответ ETerapy",
      prompt: currentDialogue.messages
        .filter((message) => message.role === "USER")
        .map((message) => message.content)
        .join("\n\n"),
      result: answer,
    });
  }, []);

  async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(typeof data.error === "string" ? data.error : "Не удалось выполнить запрос");
    }
    return data as T;
  }

  async function startDialogue() {
    if (!question.trim()) return;
    setError("");
    setPhase("processing");
    setDialogue(null);
    setClarification("");
    setClarifyingAnswers([]);
    setSaveState("idle");

    try {
      const data = await requestJson<{ dialogue: DialoguePayload }>("/api/dialogues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim() }),
      });
      setDialogue(data.dialogue);
      if (data.dialogue.status === "SAFETY_INTERRUPTED" || data.dialogue.safety?.interrupt) {
        setPhase("safety");
        return;
      }
      setPhase("clarifying");
    } catch (err) {
      setPhase("question");
      setError(err instanceof Error ? err.message : "Не удалось начать диалог");
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has("question")) return;
    if (autoStartedRef.current || phase !== "question" || question.trim().length < 3) return;
    autoStartedRef.current = true;
    void startDialogue();
    // The first landing question should become the first chat message immediately.
    // startDialogue intentionally stays as the single implementation of the API call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, question]);

  async function generateAnswer(dialogueId: string) {
    setError("");
    setRetrying(false);
    setPhase("processing");

    try {
      const data = await requestJson<{ dialogue: DialoguePayload; generated: boolean }>(`/api/dialogues/${dialogueId}/answer`, {
        method: "POST",
      });
      setDialogue(data.dialogue);
      const answer = data.dialogue.primaryAnswer?.content ?? "";
      if (answer) saveDraft(answer, data.dialogue);
      setPhase("result");
    } catch (err) {
      setRetrying(true);
      setError(err instanceof Error ? err.message : "Не удалось получить ответ");
    }
  }

  async function submitClarification(message: string, skipAll = false) {
    if (!dialogue) return;
    setError("");
    setPhase("processing");

    try {
      const data = await requestJson<{ dialogue: DialoguePayload }>(`/api/dialogues/${dialogue.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(skipAll ? { action: "skip_clarifications" } : { message }),
      });
      setDialogue(data.dialogue);
      setClarification("");
      setClarifyingAnswers([]);
      await generateAnswer(data.dialogue.id);
    } catch (err) {
      setPhase("clarifying");
      setError(err instanceof Error ? err.message : "Не удалось отправить уточнение");
    }
  }

  async function sendClarification(skip = false) {
    if (!dialogue) return;
    const answer = skip ? "Пропущено" : clarification.trim();
    if (!answer) return;

    const nextAnswers = [...clarifyingAnswers, answer];
    const isLastQuestion = nextAnswers.length >= clarifyingQuestions.length;
    if (!isLastQuestion) {
      setClarifyingAnswers(nextAnswers);
      setClarification("");
      setError("");
      return;
    }

    const skippedEverything = nextAnswers.every((item) => item === "Пропущено");
    const message = nextAnswers
      .map((item, index) => {
        const prompt = clarifyingQuestions[index] ?? `Уточнение ${index + 1}`;
        return `Уточнение ${index + 1}: ${prompt}\nОтвет: ${item}`;
      })
      .join("\n\n");
    await submitClarification(message, skippedEverything);
  }

  function reset() {
    setQuestion("");
    setClarification("");
    setClarifyingAnswers([]);
    setDialogue(null);
    setPhase("question");
    setError("");
    setSaveState("idle");
    setRetrying(false);
    setRecommendations([]);
  }

  async function handleSaveToAccount() {
    setSaveState("saving");
    const persisted = await persistGuestResultDraftToAccount();
    setSaveState(persisted.saved ? "saved" : "error");
  }

  const progress = phase === "question"
    ? { current: 1, total: 4 }
    : phase === "clarifying"
      ? { current: 2, total: 4 }
      : phase === "processing"
        ? { current: 3, total: 4 }
        : phase === "result"
          ? { current: 4, total: 4 }
          : undefined;

  return (
    <DialogueShell
      className="soft-clarity-page soft-dialogue-page"
      title={phase === "result" ? "Ваш первичный ответ" : phase === "safety" ? "Экстренная поддержка" : "Диалог ясности"}
      description={
        phase === "result"
          ? "Это первый слой ответа. Его можно сохранить, отправить себе или углубить."
          : phase === "safety"
            ? "В этом сценарии ETerapy не показывает платные действия и помогает перейти к безопасному следующему шагу."
            : "Напишите ситуацию своими словами. Диалог уточнит контекст и даст бесплатный первичный ответ."
      }
      progress={progress}
    >
      <PublicJsonLd route="/checkin" />

      {phase === "question" && (
        <div className="soft-dialogue-start" data-testid="dialogue-question-step">
          <div className="soft-halo-stage soft-dialogue-halo-stage">
            <div className="soft-ask-card soft-dialogue-ask-card">
              <div className="mb-3 flex items-center justify-between gap-3">
                <label htmlFor="dialogue-question" className="soft-eyebrow">
                  С чего начнем
                </label>
                <span className="soft-badge">
                  <ShieldCheck className="size-3" aria-hidden="true" />
                  приватно
                </span>
              </div>
              <textarea
                id="dialogue-question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Расскажите своими словами. Не нужно структурировать — мы поможем."
                className="soft-question-input"
                rows={5}
                data-testid="dialogue-question-input"
              />
              <div className="soft-ask-foot">
                <p className="text-xs leading-relaxed text-[var(--soft-ink-faint)]">
                  {restoring ? "Восстанавливаю сохраненный диалог..." : "Регистрация понадобится только если вы захотите сохранить результат."}
                </p>
                <Button
                  onClick={startDialogue}
                  disabled={restoring || question.trim().length < 3}
                  className="soft-button soft-button-primary"
                  data-testid="dialogue-start-button"
                >
                  Отправить
                  <Send className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          </div>
          <Disclaimer className="soft-dialogue-disclaimer mt-5" tone="info" title="Ограничение">
            Сервис не является медицинской, юридической, финансовой или психологической консультацией.
          </Disclaimer>
        </div>
      )}

      {phase === "clarifying" && dialogue && (
        <div className="soft-dialogue-chat" data-testid="dialogue-clarifying-step">
          <div className="soft-msg-row soft-msg-row-user">
            <div className="soft-msg-avatar soft-msg-avatar-user" aria-hidden="true">В</div>
            <div className="soft-msg-bubble soft-msg-bubble-user">
              {question || dialogue.title}
            </div>
          </div>

          <div className="soft-msg-row soft-msg-row-assistant">
            <div className="soft-msg-avatar" aria-hidden="true" />
            <div className="soft-msg-bubble soft-msg-bubble-assistant">
              Спасибо, что доверились. Я задам несколько коротких вопросов по одному — так ответ получится точнее и без лишнего давления.
            </div>
          </div>

          {clarifyingAnswers.map((answer, index) => (
            <div key={`${clarifyingQuestions[index]}-${index}`} className="contents">
              <div className="soft-msg-row soft-msg-row-assistant">
                <div className="soft-msg-avatar" aria-hidden="true" />
                <div className="soft-msg-bubble soft-msg-bubble-assistant" data-testid="dialogue-clarifying-question">
                  <span className="soft-eyebrow text-[10px]">вопрос {index + 1} из {clarifyingQuestions.length}</span>
                  <p className="mt-1">{clarifyingQuestions[index]}</p>
                </div>
              </div>
              <div className="soft-msg-row soft-msg-row-user">
                <div className="soft-msg-avatar soft-msg-avatar-user" aria-hidden="true">В</div>
                <div className="soft-msg-bubble soft-msg-bubble-user" data-testid="dialogue-clarifying-answer">
                  {answer}
                </div>
              </div>
            </div>
          ))}

          <div className="soft-msg-row soft-msg-row-assistant">
            <div className="soft-msg-avatar" aria-hidden="true" />
            <div>
              <div className="soft-msg-bubble soft-msg-bubble-assistant" data-testid="dialogue-clarifying-question">
                <span className="soft-eyebrow text-[10px]">вопрос {clarifyingAnswers.length + 1} из {clarifyingQuestions.length}</span>
                <p className="mt-1">{currentClarifyingQuestion}</p>
              </div>
              <div className="mt-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-[var(--soft-ink-faint)]">
                  подсказки возможных ответов
                </p>
                <div className="flex flex-wrap gap-2">
                  {suggestedClarificationAnswers.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className="soft-chip"
                      onClick={() => setClarification((current) => current ? `${current}; ${item}` : item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="soft-ask-card soft-dialogue-composer">
            <label htmlFor="dialogue-clarification" className="sr-only">Ответ на уточнение</label>
            <textarea
              id="dialogue-clarification"
              value={clarification}
              onChange={(event) => setClarification(event.target.value)}
              placeholder="Ответьте на этот вопрос. Можно коротко."
              className="soft-question-input soft-dialogue-composer-input"
              rows={4}
              data-testid="dialogue-clarification-input"
            />
            <div className="soft-ask-foot">
              <Button
                variant="outline"
                onClick={() => sendClarification(true)}
                className="soft-button soft-button-ghost"
                data-testid="dialogue-skip-clarification"
              >
                Пропустить вопрос
              </Button>
              <Button
                onClick={() => sendClarification(false)}
                disabled={!clarification.trim()}
                className="soft-button soft-button-primary"
                data-testid="dialogue-send-clarification"
              >
                {clarifyingAnswers.length + 1 >= clarifyingQuestions.length ? "Получить ответ" : "Следующий вопрос"}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {phase === "processing" && (
        <div className="soft-card soft-processing-card" data-testid="dialogue-processing-step">
          <div className="soft-processing-orb">
            <Loader2 className="absolute inset-0 m-auto size-6 animate-spin text-[var(--soft-bordeaux)]" aria-hidden="true" />
          </div>
          <p className="mt-5 font-heading text-2xl text-[var(--soft-bordeaux)]">Готовлю ответ</p>
          <div className="mt-3 space-y-1 text-sm text-[var(--soft-ink-soft)]">
            {processingLines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
          {error && (
            <div className="mt-5">
              <p className="text-sm text-destructive">{error}</p>
              {retrying && dialogue && (
                <Button className="soft-button soft-button-ghost mt-3" variant="outline" onClick={() => generateAnswer(dialogue.id)} data-testid="dialogue-retry-answer">
                  Попробовать еще раз
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {phase === "safety" && (
        <div className="soft-card p-6" data-testid="dialogue-safety-interrupt">
          <Disclaimer className="soft-dialogue-disclaimer" tone="warning" title="Экстренная поддержка">
            Если есть риск причинить вред себе или другому человеку, обратитесь в экстренные службы или к близкому человеку рядом. ETerapy не будет предлагать платные продукты в таком сценарии.
          </Disclaimer>
          <div className="mt-4 grid gap-3 sm:grid-cols-3" data-testid="dialogue-safety-support-actions">
            {[
              ["112", "экстренные службы"],
              ["Близкий человек", "попросите побыть рядом"],
              ["support@eterapy.com", "поддержка ETerapy"],
            ].map(([title, subtitle]) => (
              <div key={title} className="soft-card-flat p-3">
                <p className="font-heading text-lg font-semibold text-[var(--soft-bordeaux)]">{title}</p>
                <p className="text-xs text-[var(--soft-ink-faint)]">{subtitle}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Button className="soft-button soft-button-ghost" variant="outline" onClick={reset}>
              <RotateCcw className="size-4" aria-hidden="true" />
              Задать другой вопрос
            </Button>
            <Link href="/legal/ethics" className="soft-button soft-button-ghost">
              Принципы безопасности
            </Link>
          </div>
        </div>
      )}

      {phase === "result" && dialogue && safeAnswer && (
        <div className="soft-answer-flow" data-testid="dialogue-result-step">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button onClick={reset} className="soft-chip">
              ← Новый вопрос
            </button>
            <span className="soft-badge">
              <CheckCircle2 className="size-3" aria-hidden="true" />
              разбор готов
            </span>
            <span className="soft-badge soft-badge-warm">бесплатно</span>
          </div>
          <p className="soft-eyebrow">первичный разбор</p>

          <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.85fr)] lg:items-start" data-testid="dialogue-answer-triage-layout">
            <div>
              <article className="soft-card p-5 md:p-7">
                <p className="soft-eyebrow">что я слышу в вашем вопросе</p>
                <div className="mt-3 whitespace-pre-wrap font-heading text-[19px] leading-relaxed text-[var(--soft-ink)]" data-testid="dialogue-primary-answer">
                  {safeAnswer}
                </div>
              </article>

              <section className="soft-card-flat mt-4 p-5 md:p-7" style={{ background: "var(--soft-paper-deep)", border: 0 }}>
                <p className="soft-eyebrow text-[var(--soft-terracotta-dark)]">главная развилка</p>
                <h2 className="soft-h3 mt-2">Это про решение прямо сейчас — или про ясность, которой пока не хватает?</h2>
                <p className="mt-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                  Первичный ответ помогает увидеть контур. Если хочется не спешить, можно сохранить его, вернуться позже или открыть один более глубокий формат.
                </p>
              </section>

              <section className="soft-card soft-safe-step-card mt-4 p-5 md:p-7">
                <p className="soft-eyebrow text-[var(--soft-terracotta-dark)]">один безопасный шаг сегодня</p>
                <h2 className="soft-h3 mt-2 font-heading italic">Запишите одну фразу, которую вы давно хотели сказать себе честно.</h2>
                <p className="mt-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                  Не отправлять, не доказывать, не решать все сразу. Просто дать мысли форму и посмотреть, что в ней правда.
                </p>
              </section>

              <div className="mt-5">
                <AIShareButton tool="CHECKIN" title="Первичный ответ ETerapy" resultText={safeAnswer} />
              </div>

              <div className="mt-5 flex flex-wrap gap-3" data-testid="dialogue-free-continuation-actions">
                {status === "authenticated" ? (
                  <Button
                    onClick={handleSaveToAccount}
                    disabled={saveState === "saving" || saveState === "saved"}
                    className="soft-button soft-button-ghost"
                    data-testid="save-result-authenticated"
                  >
                    <Bookmark className="size-4" aria-hidden="true" />
                    {saveState === "saved" ? "Сохранено в кабинете" : saveState === "saving" ? "Сохраняем..." : "Сохранить в карту"}
                  </Button>
                ) : (
                  <Link href="/register?intent=save-result" className="soft-button soft-button-ghost" data-testid="save-result-register">
                    <Bookmark className="size-4" aria-hidden="true" />
                    Сохранить в карту
                  </Link>
                )}
                <Link href="/circle" className="soft-button soft-button-ghost" data-testid="dialogue-free-circle">
                  <Users className="size-4" aria-hidden="true" />
                  Второй взгляд
                </Link>
                <Link href="/pair" className="soft-button soft-button-ghost" data-testid="dialogue-free-pair">
                  <Heart className="size-4" aria-hidden="true" />
                  Вдвоём
                </Link>
                <Button onClick={reset} variant="ghost" className="soft-button soft-button-ghost" data-testid="dialogue-reset">
                  <RotateCcw className="size-4" aria-hidden="true" />
                  Новый вопрос
                </Button>
              </div>
            </div>

            <aside className="soft-triage-rail lg:sticky lg:top-24" data-testid="dialogue-triage-rail" aria-label="Выбор углубления">
              <p className="soft-eyebrow text-[var(--soft-terracotta-dark)]">можно посмотреть глубже</p>
              <Link
                href={`/products/perspectives?dialogueId=${dialogue.id}`}
                className="soft-card soft-triage-primary mt-3 block p-5"
                data-testid="triage-primary-cta"
                data-analytics-surface="checkin_triage"
                data-analytics-event="triage_primary_clicked"
                data-analytics-target={`/products/perspectives?dialogueId=${dialogue.id}`}
                data-analytics-product="perspectives"
                data-analytics-dialogue-id={dialogue.id}
                data-analytics-cta-role="primary"
                data-analytics-offer-id="perspectives_first_paid_step"
                data-analytics-offer-reason="decision_request_after_free_answer"
                data-analytics-price-rub="299"
                data-analytics-credit-cost="2"
              >
                <span className="soft-triage-ribbon">рекомендуем именно вам</span>
                <div className="mt-2 flex items-start gap-3">
                  <Compass className="mt-1 size-6 shrink-0 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
                  <div>
                    <h3 className="soft-h3">4 ракурса ответа</h3>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                      Похоже на запрос про решение. Разложим ситуацию на разум, чувства, символ и действие.
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid gap-1.5 text-xs text-[var(--soft-ink-soft)]">
                  {["Разум · факты и варианты", "Чувства · что внутри", "Символ · образ ситуации", "Действие · шаги на неделю"].map((item) => (
                    <span key={item} className="flex items-center gap-2">
                      <CheckCircle2 className="size-3.5 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
                      {item}
                    </span>
                  ))}
                </div>
                <div className="mt-5 flex items-end justify-between gap-4">
                  <div>
                    <div className="font-heading text-3xl font-semibold leading-none text-[var(--soft-bordeaux)]">299 ₽</div>
                    <div className="mt-1 text-[11px] text-[var(--soft-ink-faint)]">или −2 кредита</div>
                  </div>
                  <span className="soft-button soft-button-primary text-sm">
                    Открыть
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </span>
                </div>
              </Link>

              <p className="soft-eyebrow mt-6">другие форматы</p>
              <div className="mt-2 grid gap-2" data-testid="triage-secondary-options">
                {[
                  { href: `/products/deep-report?dialogueId=${dialogue.id}`, title: "Глубокий отчёт", price: "590 ₽", credits: "−4 кредита", priceRub: "590", creditCost: "4", icon: FileText, product: "deep_report", reason: "needs_full_synthesis" },
                  { href: `/products/chat-analysis?dialogueId=${dialogue.id}`, title: "Разбор переписки", price: "от 390 ₽", credits: "−2 кредита", priceRub: "390", creditCost: "2", icon: MessageSquareText, product: "chat_analysis", reason: "message_context_available" },
                  { href: `/products/compatibility?dialogueId=${dialogue.id}`, title: "Совместимость", price: "590 ₽", credits: "−4 кредита", priceRub: "590", creditCost: "4", icon: Users, product: "compatibility", reason: "relationship_context" },
                  { href: "/products/seven-days", title: "7 дней к ясности", price: "990 ₽", credits: "−8 кредитов", priceRub: "990", creditCost: "8", icon: CalendarDays, product: "seven_days", reason: "ongoing_practice" },
                  { href: "/products/tarot", title: "Расклад Таро", price: "390 ₽", credits: "−2 кредита", priceRub: "390", creditCost: "2", icon: Moon, product: "tarot", reason: "symbolic_view" },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.title}
                      href={item.href}
                      className="soft-triage-option"
                      data-analytics-surface="checkin_triage"
                      data-analytics-event="triage_secondary_clicked"
                      data-analytics-target={item.href}
                      data-analytics-product={item.product}
                      data-analytics-dialogue-id={dialogue.id}
                      data-analytics-cta-role="secondary"
                      data-analytics-offer-id={`${item.product}_secondary`}
                      data-analytics-offer-reason={item.reason}
                      data-analytics-price-rub={item.priceRub}
                      data-analytics-credit-cost={item.creditCost}
                    >
                      <Icon className="size-4 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-[var(--soft-ink)]">{item.title}</span>
                        <span className="block text-[11px] text-[var(--soft-ink-faint)]">или {item.credits}</span>
                      </span>
                      <span className="font-heading font-semibold text-[var(--soft-bordeaux)]">{item.price}</span>
                    </Link>
                  );
                })}
                {recommendations.length > 0 ? (
                  recommendations.slice(0, 1).map((rec) => (
                    <Link
                      key={rec.id}
                      href={`/practitioners/${rec.slug}?dialogueId=${dialogue.id}`}
                      className="soft-triage-option"
                      data-testid="specialist-recommendation"
                      data-analytics-surface="checkin_triage"
                      data-analytics-event="triage_secondary_clicked"
                      data-analytics-target={`/practitioners/${rec.slug}?dialogueId=${dialogue.id}`}
                      data-analytics-product="specialist"
                      data-analytics-dialogue-id={dialogue.id}
                      data-analytics-cta-role="secondary"
                      data-analytics-offer-id="specialist_recommendation"
                      data-analytics-offer-reason="human_continuation_after_context"
                      data-analytics-price-rub={rec.pricePerSession}
                    >
                      <Heart className="size-4 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-[var(--soft-ink)]">{rec.name ?? "Специалист"}</span>
                        <span className="block truncate text-[11px] text-[var(--soft-ink-faint)]">{rec.rationale}</span>
                      </span>
                      <span className="font-heading font-semibold text-[var(--soft-bordeaux)]">от {rec.pricePerSession.toLocaleString("ru-RU")} ₽</span>
                    </Link>
                  ))
                ) : (
                  <Link
                    href={`/practitioners?dialogueId=${dialogue.id}`}
                    className="soft-triage-option"
                    data-analytics-surface="checkin_triage"
                    data-analytics-event="triage_secondary_clicked"
                    data-analytics-target={`/practitioners?dialogueId=${dialogue.id}`}
                    data-analytics-product="specialist"
                    data-analytics-dialogue-id={dialogue.id}
                    data-analytics-cta-role="secondary"
                    data-analytics-offer-id="specialist_catalog_fallback"
                    data-analytics-offer-reason="human_continuation_after_context"
                    data-analytics-price-rub="4500"
                  >
                    <Heart className="size-4 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-[var(--soft-ink)]">Встреча со специалистом</span>
                      <span className="block text-[11px] text-[var(--soft-ink-faint)]">после контекста</span>
                    </span>
                    <span className="font-heading font-semibold text-[var(--soft-bordeaux)]">от 4 500 ₽</span>
                  </Link>
                )}
              </div>

              <div className="soft-card mt-4 p-4" style={{ background: "var(--soft-paper-deep)" }} data-testid="triage-subscription-option">
                <div className="flex gap-3">
                  <Sparkles className="mt-1 size-4 shrink-0 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
                  <div>
                    <p className="soft-eyebrow text-[10px]">если планируете возвращаться</p>
                    <h3 className="mt-1 font-heading text-base font-semibold text-[var(--soft-bordeaux)]">В Plus цифровые форматы включены</h3>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--soft-ink-faint)]">Моя карта · история · 10 кредитов / мес</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="font-heading text-xl font-semibold text-[var(--soft-bordeaux)]">490 ₽ / мес</span>
                  <Link
                    href="/pricing"
                    className="soft-chip"
                    data-analytics-surface="checkin_triage"
                    data-analytics-event="triage_subscription_clicked"
                    data-analytics-target="/pricing"
                    data-analytics-product="plus"
                    data-analytics-dialogue-id={dialogue.id}
                    data-analytics-cta-role="bundle"
                    data-analytics-offer-id="plus_bundle_after_triage"
                    data-analytics-offer-reason="returning_usage_bundle"
                    data-analytics-price-rub="490"
                  >
                    Сравнить тарифы →
                  </Link>
                </div>
              </div>
            </aside>
          </div>

          {status !== "authenticated" && (
            <p className="mt-4 text-sm text-[var(--soft-ink-soft)]">
              Ответ сохранится после регистрации. Уже есть аккаунт?{" "}
              <Link href="/login?intent=save-result" className="font-medium text-[var(--soft-terracotta-dark)] hover:underline">
                Войти
              </Link>
            </p>
          )}
          {saveState === "error" && <p className="mt-3 text-sm text-destructive">Не удалось сохранить. Попробуйте еще раз.</p>}
          <Disclaimer className="soft-dialogue-disclaimer mt-6" tone="info" title="Ограничение">
            Первичный ответ помогает увидеть следующий шаг, но не заменяет профильную помощь и не является прогнозом с гарантией.
          </Disclaimer>
        </div>
      )}

      {error && phase !== "processing" && <p className="mt-4 text-sm text-destructive">{error}</p>}
    </DialogueShell>
  );
}
