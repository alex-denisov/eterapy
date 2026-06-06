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

// B319: hard cap on user input length per turn. 1200 characters is roomy
// for a thoughtful 2-3 paragraph reply while still keeping LLM context
// bounded and discouraging novella-length submissions that derail the
// clarifying loop. Counter switches to amber at -200 and to bordeaux
// at -50 from the cap.
const DIALOGUE_INPUT_MAX_CHARS = 1200;

// W17: icon per product slug for the dynamic "другие форматы" list.
const PRODUCT_ICONS: Record<string, typeof Compass> = {
  perspectives: Compass,
  "deep-report": FileText,
  "chat-analysis": MessageSquareText,
  compatibility: Users,
  pair: Users,
  circle: Users,
  "seven-days": CalendarDays,
  "clarity-practice": Sparkles,
  "my-map": Compass,
  tarot: Moon,
  "natal-chart": Moon,
  numerology: Sparkles,
};

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

type ProductRecommendation = {
  slug: string;
  name: string;
  href: string;
  reason: string;
  price?: string;
  creditCost?: number | null;
};

// W17: dynamic "другие форматы" + subscription nudge, both topic-driven by the API.
type SecondaryProduct = {
  slug: string;
  name: string;
  href: string;
  price: string;
  creditCost: number | null;
};
type SubscriptionRecommendation = {
  tier: "plus" | "premium";
  name: string;
  priceRub: number;
  reason: string;
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
  clarifyingQuestions?: { question: string; chips?: string[] }[];
  primaryAnswer?: {
    id: string;
    content: string;
    createdAt: string;
  } | null;
  messages: DialogueMessage[];
  createdAt: string;
  updatedAt: string;
};

type DialogueLimitPaywall = {
  audience?: string;
  limit?: number;
  used?: number;
  cta?: "register" | "upgrade";
};

type ApiErrorPayload = {
  error?: string;
  code?: string;
  audience?: string;
  limit?: number;
  used?: number;
  cta?: "register" | "upgrade";
};

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
  // B318: inline typing indicator + sending lock without leaving the
  // clarifying screen. While `awaitingAssistant=true`, the user's last
  // bubble is already on screen (optimistic), the input is disabled but
  // visible, and a soft-typing dot row renders below the user's bubble.
  const [awaitingAssistant, setAwaitingAssistant] = useState(false);
  const [dialogue, setDialogue] = useState<DialoguePayload | null>(null);
  const [phase, setPhase] = useState<"question" | "clarifying" | "processing" | "result" | "safety">("question");
  const [error, setError] = useState("");
  const [limitPaywall, setLimitPaywall] = useState<DialogueLimitPaywall | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [retrying, setRetrying] = useState(false);
  const [recommendations, setRecommendations] = useState<PractitionerRecommendation[]>([]);
  const [productRecommendation, setProductRecommendation] = useState<ProductRecommendation | null>(null);
  const [secondaryProducts, setSecondaryProducts] = useState<SecondaryProduct[]>([]);
  const [subscriptionRec, setSubscriptionRec] = useState<SubscriptionRecommendation | null>(null);
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
    const questions = (dialogue?.clarifyingQuestions ?? []).filter((item) => item.question.trim());
    return questions;
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
      .then((data: {
        recommendations: PractitionerRecommendation[];
        productRecommendation?: ProductRecommendation;
        secondaryProducts?: SecondaryProduct[];
        subscription?: SubscriptionRecommendation | null;
      }) => {
        if (cancelled) return;
        if (Array.isArray(data.recommendations)) {
          setRecommendations(data.recommendations);
          if (data.recommendations.length > 0) {
            track({ event: "specialist_recommended", surface: "checkin", dialogueId: dialogue.id, properties: { count: data.recommendations.length } });
          }
        }
        if (data.productRecommendation) {
          setProductRecommendation(data.productRecommendation);
          track({ event: "product_recommended", surface: "checkin", dialogueId: dialogue.id, properties: { product: data.productRecommendation.slug } });
        }
        if (Array.isArray(data.secondaryProducts)) setSecondaryProducts(data.secondaryProducts);
        setSubscriptionRec(data.subscription ?? null);
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
    const data = await response.json().catch(() => ({})) as ApiErrorPayload;
    if (!response.ok) {
      const error = new Error(typeof data.error === "string" ? data.error : "Не удалось выполнить запрос");
      (error as Error & { payload?: ApiErrorPayload }).payload = data;
      throw error;
    }
    return data as T;
  }

  async function startDialogue() {
    if (!question.trim()) return;
    setError("");
    setLimitPaywall(null);
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
      // Reflect dialogue id in the URL so refresh restores the session
      // (Product DoD: "Есть восстановление сессии после refresh")
      if (typeof window !== "undefined" && data.dialogue?.id) {
        const url = new URL(window.location.href);
        url.searchParams.set("dialogueId", data.dialogue.id);
        url.searchParams.delete("question");
        window.history.replaceState(null, "", url.toString());
      }
      if (data.dialogue.status === "SAFETY_INTERRUPTED" || data.dialogue.safety?.interrupt) {
        setPhase("safety");
        return;
      }
      setPhase("clarifying");
    } catch (err) {
      const payload = (err as Error & { payload?: ApiErrorPayload }).payload;
      if (payload?.code === "DIALOGUE_DAILY_LIMIT") {
        const paywall = {
          audience: payload.audience,
          limit: payload.limit,
          used: payload.used,
          cta: payload.cta,
        };
        setLimitPaywall(paywall);
        track({ event: "dialogue_limit_hit", surface: "checkin", properties: paywall });
        track({ event: "paywall_hit", surface: "checkin", properties: { ...paywall, surface: "dialogue_daily_limit" } });
        track({ event: "dialogue_limit_paywall_shown", surface: "checkin", properties: paywall });
        setError("");
        setPhase("question");
        return;
      }
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

  useEffect(() => {
    if (phase !== "clarifying" || !dialogue || clarifyingQuestions.length > 0) return;
    const timer = window.setTimeout(() => {
      void submitClarification("", true);
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, dialogue?.id, clarifyingQuestions.length]);

  async function sendClarification(skip = false, overrideText?: string) {
    if (!dialogue) return;
    if (awaitingAssistant) return;
    const answer = skip ? "Пропущено" : (overrideText ?? clarification.trim());
    if (!answer) return;

    setError("");
    // B318: optimistic append — user bubble shows immediately, no phase
    // switch to "processing" while we wait for the next clarifying turn.
    const nextAnswers = [...clarifyingAnswers, answer];
    setClarifyingAnswers(nextAnswers);
    setClarification("");
    setAwaitingAssistant(true);

    try {
      const data = await requestJson<{
        dialogue: DialoguePayload;
        nextQuestion?: { question: string; chips?: string[] } | null;
      }>(`/api/dialogues/${dialogue.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: answer }),
      });

      if (data.nextQuestion) {
        setDialogue({
          ...dialogue,
          ...data.dialogue,
          clarifyingQuestions: [...(dialogue.clarifyingQuestions ?? []), data.nextQuestion],
        });
        setAwaitingAssistant(false);
        setPhase("clarifying");
      } else {
        setDialogue(data.dialogue);
        setAwaitingAssistant(false);
        setPhase("processing");
        await generateAnswer(data.dialogue.id);
      }
    } catch (err) {
      // Roll the optimistic bubble back so the user can retry without
      // duplicating their answer.
      setClarifyingAnswers(clarifyingAnswers);
      setClarification(answer);
      setAwaitingAssistant(false);
      setPhase("clarifying");
      setError(err instanceof Error ? err.message : "Не удалось отправить уточнение");
    }
  }

  function reset() {
    setQuestion("");
    setClarification("");
    setClarifyingAnswers([]);
    setDialogue(null);
    setPhase("question");
    setError("");
    setLimitPaywall(null);
    setSaveState("idle");
    setRetrying(false);
    setRecommendations([]);
    // Drop the dialogueId query so refresh after reset truly returns
    // to the empty ask card instead of restoring the previous session.
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("dialogueId");
      url.searchParams.delete("question");
      window.history.replaceState(null, "", url.toString());
    }
  }

  async function handleSaveToAccount() {
    setSaveState("saving");
    const persisted = await persistGuestResultDraftToAccount();
    setSaveState(persisted.saved ? "saved" : "error");
  }

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
                onChange={(event) => setQuestion(event.target.value.slice(0, DIALOGUE_INPUT_MAX_CHARS))}
                placeholder="Расскажите своими словами. Не нужно структурировать — мы поможем."
                className="soft-question-input"
                rows={5}
                maxLength={DIALOGUE_INPUT_MAX_CHARS}
                data-testid="dialogue-question-input"
              />
              {limitPaywall && (
                <div className="mt-4 rounded-[var(--soft-radius-lg)] bg-[var(--soft-paper-deep)] p-4" data-testid="dialogue-limit-paywall">
                  <p className="soft-eyebrow">дневной ритм</p>
                  {limitPaywall.cta === "register" ? (
                    <>
                      <h2 className="mt-2 font-heading text-xl font-semibold text-[var(--soft-bordeaux)]">
                        На сегодня бесплатный разбор использован
                      </h2>
                      <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                        Зарегистрируйтесь, чтобы продолжить прямо сейчас: это бесплатно, откроет 3 разбора в день и welcome-кредиты.
                      </p>
                      <Link
                        href="/register?intent=continue-dialogue"
                        className="soft-button soft-button-primary mt-4 inline-flex"
                        data-testid="register-to-continue"
                        onClick={() => track({ event: "dialogue_limit_register_clicked", surface: "checkin", properties: limitPaywall })}
                      >
                        Зарегистрироваться
                        <ArrowRight className="size-4" aria-hidden="true" />
                      </Link>
                    </>
                  ) : (
                    <>
                      <h2 className="mt-2 font-heading text-xl font-semibold text-[var(--soft-bordeaux)]">
                        Сегодня вы прошли {limitPaywall.limit ?? 3} разбора
                      </h2>
                      <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                        Это ваш дневной ритм на бесплатном тарифе. Можно вернуться завтра или оформить Plus, чтобы продолжать без дневного ограничения.
                      </p>
                      <div className="mt-4 flex flex-wrap gap-3">
                        <Link
                          href="/pricing#plus"
                          className="soft-button soft-button-primary"
                          data-testid="upgrade-to-plus"
                          onClick={() => track({ event: "dialogue_limit_upgrade_clicked", surface: "checkin", properties: limitPaywall })}
                        >
                          Оформить Plus
                          <ArrowRight className="size-4" aria-hidden="true" />
                        </Link>
                        <button type="button" className="soft-button soft-button-ghost" onClick={() => setLimitPaywall(null)}>
                          Вернуться завтра
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
              <div className="soft-ask-foot">
                <p className="text-xs leading-relaxed text-[var(--soft-ink-faint)]">
                  {restoring ? "Восстанавливаю сохраненный диалог..." : "Регистрация понадобится только если вы захотите сохранить результат."}
                </p>
                <span
                  className={`text-xs tabular-nums ${
                    question.length >= DIALOGUE_INPUT_MAX_CHARS - 50
                      ? "text-[var(--soft-bordeaux)] font-semibold"
                      : question.length >= DIALOGUE_INPUT_MAX_CHARS - 200
                        ? "text-[var(--soft-terracotta-dark)]"
                        : "text-[var(--soft-ink-faint)]"
                  }`}
                  data-testid="dialogue-question-char-counter"
                  aria-live="polite"
                >
                  {question.length}/{DIALOGUE_INPUT_MAX_CHARS}
                </span>
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

          {clarifyingAnswers.map((answer, index) => (
            <div key={`${clarifyingQuestions[index]?.question}-${index}`} className="contents">
              <div className="soft-msg-row soft-msg-row-assistant">
                <div className="soft-msg-avatar" aria-hidden="true" />
                <div className="soft-msg-bubble soft-msg-bubble-assistant" data-testid="dialogue-clarifying-question">
                  <p style={{ whiteSpace: "pre-wrap" }}>
                    {index === 0
                      ? `Спасибо, что доверились. Чтобы яснее увидеть ситуацию, разрешите задать пару коротких вопросов — это правда помогает.\n\n${clarifyingQuestions[index]?.question}`
                      : clarifyingQuestions[index]?.question}
                  </p>
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

          {/* B318: while waiting for the next turn, show a typing-dots bubble
              instead of jumping to the processing phase. The user's last
              optimistic bubble has already been rendered above. */}
          {awaitingAssistant && (
            <div className="soft-msg-row soft-msg-row-assistant" data-testid="dialogue-typing-indicator">
              <div className="soft-msg-avatar" aria-hidden="true" />
              <div className="soft-msg-bubble soft-msg-bubble-assistant">
                <div className="soft-typing"><span /><span /><span /></div>
              </div>
            </div>
          )}

          {!awaitingAssistant && currentClarifyingQuestion && (
            <div className="soft-msg-row soft-msg-row-assistant">
              <div className="soft-msg-avatar" aria-hidden="true" />
              <div>
                <div className="soft-msg-bubble soft-msg-bubble-assistant" data-testid="dialogue-clarifying-question">
                  <p style={{ whiteSpace: "pre-wrap" }}>
                    {clarifyingAnswers.length === 0
                      ? `Спасибо, что доверились. Чтобы яснее увидеть ситуацию, разрешите задать пару коротких вопросов — это правда помогает.\n\n${currentClarifyingQuestion.question}`
                      : currentClarifyingQuestion.question}
                  </p>
                </div>
                {(currentClarifyingQuestion.chips?.length ?? 0) > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2" data-testid="dialogue-clarifying-chips">
                    {currentClarifyingQuestion.chips?.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        className="soft-chip"
                        disabled={awaitingAssistant}
                        onClick={() => void sendClarification(false, chip)}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* B318: the composer stays visible at all times; we just lock it
              while we wait for the next turn so the user can see exactly
              where their next reply will go. */}
          <div className="soft-ask-card soft-dialogue-composer">
            <label htmlFor="dialogue-clarification" className="sr-only">Ответ на уточнение</label>
            <textarea
              id="dialogue-clarification"
              value={clarification}
              onChange={(event) => setClarification(event.target.value.slice(0, DIALOGUE_INPUT_MAX_CHARS))}
              placeholder={awaitingAssistant
                ? "Подождите, платформа сейчас сформулирует следующий вопрос…"
                : "Ответьте своими словами или выберите вариант выше…"}
              className="soft-question-input soft-dialogue-composer-input"
              rows={4}
              maxLength={DIALOGUE_INPUT_MAX_CHARS}
              disabled={awaitingAssistant}
              data-testid="dialogue-clarification-input"
            />
            <div className="soft-ask-foot">
              <button
                type="button"
                onClick={() => void sendClarification(true)}
                disabled={awaitingAssistant}
                className="soft-button soft-button-soft"
                data-testid="dialogue-skip-clarification"
              >
                Пропустить вопрос
              </button>
              {/* B319: char counter — soft-amber from 1000, soft-bordeaux from 1150 */}
              <span
                className={`text-xs tabular-nums ${
                  clarification.length >= DIALOGUE_INPUT_MAX_CHARS - 50
                    ? "text-[var(--soft-bordeaux)] font-semibold"
                    : clarification.length >= DIALOGUE_INPUT_MAX_CHARS - 200
                      ? "text-[var(--soft-terracotta-dark)]"
                      : "text-[var(--soft-ink-faint)]"
                }`}
                data-testid="dialogue-char-counter"
                aria-live="polite"
              >
                {clarification.length}/{DIALOGUE_INPUT_MAX_CHARS}
              </span>
              <button
                type="button"
                onClick={() => void sendClarification(false)}
                disabled={awaitingAssistant || !clarification.trim()}
                className="soft-button soft-button-primary"
                data-testid="dialogue-send-clarification"
              >
                Отправить
                <Send className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === "processing" && (
        <div className="soft-dialogue-chat" data-testid="dialogue-processing-step">
          <div className="soft-msg-row soft-msg-row-user">
            <div className="soft-msg-avatar soft-msg-avatar-user" aria-hidden="true">В</div>
            <div className="soft-msg-bubble soft-msg-bubble-user">
              {question || dialogue?.title || "…"}
            </div>
          </div>
          <div className="soft-msg-row soft-msg-row-assistant">
            <div className="soft-msg-avatar" aria-hidden="true" />
            <div className="soft-msg-bubble soft-msg-bubble-assistant">
              <div className="soft-typing">
                <span /><span /><span />
              </div>
            </div>
          </div>
          {error && (
            <div className="mt-5">
              <p className="text-sm text-destructive">{error}</p>
              {retrying && dialogue && (
                <Button className="soft-button soft-button-soft mt-3" variant="outline" onClick={() => generateAnswer(dialogue.id)} data-testid="dialogue-retry-answer">
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

              {/* W16: a clear, calm action hierarchy instead of five equal
                  buttons. The ONE primary step is keeping the result; sharing
                  and a fresh question are quiet secondary actions. The deepening
                  upsells (Второй взгляд / Вдвоём) live in the triage rail on the
                  right, so they are no longer duplicated here. */}
              <div className="mt-5 flex flex-wrap items-center gap-2" data-testid="dialogue-free-continuation-actions">
                {status === "authenticated" ? (
                  <Button
                    onClick={handleSaveToAccount}
                    disabled={saveState === "saving" || saveState === "saved"}
                    className="soft-button soft-button-primary"
                    data-testid="save-result-authenticated"
                  >
                    <Bookmark className="size-4" aria-hidden="true" />
                    {saveState === "saved" ? "Сохранено в кабинете" : saveState === "saving" ? "Сохраняем..." : "Сохранить в карту"}
                  </Button>
                ) : (
                  <Link href="/register?intent=save-result" className="soft-button soft-button-primary" data-testid="save-result-register">
                    <Bookmark className="size-4" aria-hidden="true" />
                    Сохранить в карту
                  </Link>
                )}
                <AIShareButton tool="CHECKIN" title="Первичный ответ ETerapy" resultText={safeAnswer} inline />
                <Button onClick={reset} className="soft-button soft-button-ghost" data-testid="dialogue-reset">
                  <RotateCcw className="size-4" aria-hidden="true" />
                  Новый вопрос
                </Button>
              </div>
            </div>

            <aside className="soft-triage-rail lg:sticky lg:top-24" data-testid="dialogue-triage-rail" aria-label="Выбор углубления">
              <p className="soft-eyebrow text-[var(--soft-terracotta-dark)]">можно посмотреть глубже</p>
              {productRecommendation && productRecommendation.slug !== "perspectives" ? (
                <Link
                  href={`${productRecommendation.href}?dialogueId=${dialogue.id}`}
                  className="soft-card soft-triage-primary mt-3 block p-5"
                  data-testid="triage-primary-cta"
                  data-analytics-surface="checkin_triage"
                  data-analytics-event="triage_primary_clicked"
                  data-analytics-target={`${productRecommendation.href}?dialogueId=${dialogue.id}`}
                  data-analytics-product={productRecommendation.slug}
                  data-analytics-dialogue-id={dialogue.id}
                  data-analytics-cta-role="primary"
                  data-analytics-offer-id={`${productRecommendation.slug}_topic_recommendation`}
                  data-analytics-offer-reason={`topic_${dialogue.topic ?? "other"}`}
                >
                  <span className="soft-triage-ribbon">рекомендуем именно вам</span>
                  <div className="mt-2 flex items-start gap-3">
                    <Compass className="mt-1 size-6 shrink-0 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
                    <div>
                      <h3 className="soft-h3">{productRecommendation.name}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                        {productRecommendation.reason}
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 flex items-end justify-end">
                    <span className="soft-button soft-button-primary text-sm">
                      Открыть
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </span>
                  </div>
                </Link>
              ) : (
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
                        {productRecommendation?.reason ?? "Похоже на запрос про решение. Разложим ситуацию на разум, чувства, символ и действие."}
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
                      <div className="font-heading text-3xl font-semibold leading-none text-[var(--soft-bordeaux)]">{productRecommendation?.price ?? "299 ₽"}</div>
                      <div className="mt-1 text-[11px] text-[var(--soft-ink-faint)]">
                        {productRecommendation?.creditCost != null ? `или −${productRecommendation.creditCost} кредита` : "или −1 кредит"}
                      </div>
                    </div>
                    <span className="soft-button soft-button-primary text-sm">
                      Открыть
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </span>
                  </div>
                </Link>
              )}

              <p className="soft-eyebrow mt-6">другие форматы</p>
              <div className="mt-2 grid gap-2" data-testid="triage-secondary-options">
                {/* W17: topic-adjacent products from the recommendation API,
                    deduped against the primary recommendation — no longer a
                    static 5-item list identical for every dialogue. */}
                {secondaryProducts.map((item) => {
                  const Icon = PRODUCT_ICONS[item.slug] ?? Sparkles;
                  const href = `${item.href}?dialogueId=${dialogue.id}`;
                  return (
                    <Link
                      key={item.slug}
                      href={href}
                      className="soft-triage-option"
                      data-testid="triage-secondary-option"
                      data-analytics-surface="checkin_triage"
                      data-analytics-event="triage_secondary_clicked"
                      data-analytics-target={href}
                      data-analytics-product={item.slug}
                      data-analytics-dialogue-id={dialogue.id}
                      data-analytics-cta-role="secondary"
                      data-analytics-offer-id={`${item.slug}_secondary`}
                      data-analytics-offer-reason={`topic_${dialogue.topic ?? "other"}`}
                    >
                      <Icon className="size-4 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-[var(--soft-ink)]">{item.name}</span>
                        {item.creditCost != null && (
                          <span className="block text-[11px] text-[var(--soft-ink-faint)]">или −{item.creditCost} кредита</span>
                        )}
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

              {/* W17: the subscription nudge is now chosen by the API — Plus when
                  the recommended format is bundled in Plus, Premium when it is a
                  Premium-only format, and hidden entirely for free products,
                  sessions, or users who already subscribe (no more always-Plus). */}
              {subscriptionRec && (
                <div className="soft-card mt-4 p-4" style={{ background: "var(--soft-paper-deep)" }} data-testid="triage-subscription-option">
                  <div className="flex gap-3">
                    <Sparkles className="mt-1 size-4 shrink-0 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
                    <div>
                      <p className="soft-eyebrow text-[10px]">если планируете возвращаться</p>
                      <h3 className="mt-1 font-heading text-base font-semibold text-[var(--soft-bordeaux)]">
                        {subscriptionRec.reason}
                      </h3>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="font-heading text-xl font-semibold text-[var(--soft-bordeaux)]">
                      {subscriptionRec.priceRub.toLocaleString("ru-RU")} ₽ / мес
                    </span>
                    <Link
                      href="/pricing"
                      className="soft-chip"
                      data-analytics-surface="checkin_triage"
                      data-analytics-event="triage_subscription_clicked"
                      data-analytics-target="/pricing"
                      data-analytics-product={subscriptionRec.tier}
                      data-analytics-dialogue-id={dialogue.id}
                      data-analytics-cta-role="bundle"
                      data-analytics-offer-id={`${subscriptionRec.tier}_bundle_after_triage`}
                      data-analytics-offer-reason="returning_usage_bundle"
                      data-analytics-price-rub={subscriptionRec.priceRub}
                    >
                      Сравнить тарифы →
                    </Link>
                  </div>
                </div>
              )}
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
