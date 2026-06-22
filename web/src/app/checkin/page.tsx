"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  ArrowRight,
  Bookmark,
  ChevronLeft,
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
import { DialogueShell } from "@/components/dialogue/dialogue-shell";
import { DialogueThread } from "@/components/dialogue/dialogue-thread";
import { UserMsgAvatar } from "@/components/dialogue/user-msg-avatar";
import { useAutoGrowTextarea } from "@/lib/use-autogrow-textarea";
import { AutosavedNote } from "@/components/ui/autosaved-note";
import { SoftMarkdown } from "@/components/ui/soft-markdown";
import { Button } from "@/components/ui/button";
import { Disclaimer } from "@/components/ui/disclaimer";
import { ProductDisclaimer } from "@/components/products/product-legal";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { persistGuestResultDraftToAccount, saveGuestResultDraft } from "@/lib/guest-result-cache";
import { stripDeepeningSection } from "@/lib/dialogue-answer-format";
import { track } from "@/lib/analytics";
import { pointsWord } from "@/lib/points";
import { MIN_SESSION_PRICE_RUB, formatSessionFloor } from "@/lib/session-pricing";
import { loginUrl } from "@/lib/subdomain";

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
  // Must start `false` so the first client render matches the windowless
  // server render (which never sees `?dialogueId=`). Reading window here would
  // make the hydration-time text node diverge from the SSR HTML → React #418
  // ("Text content does not match server-rendered HTML"). The restore effect
  // below flips this to `true` synchronously on mount when a dialogueId is in
  // the URL, so the «Восстанавливаю…» banner still appears after hydration.
  const [restoring, setRestoring] = useState(false);
  // #9: controlled «первичный разбор» disclosure so the summary label can flip
  // between «показать диалог» / «скрыть диалог».
  const [historyOpen, setHistoryOpen] = useState(false);
  // Issue #1: `processing` is used both while we CREATE the dialogue (→ goes to
  // clarifying) and while we GENERATE the final разбор. Only the latter should
  // show the «что я слышу в вашем вопросе» band — otherwise it flashes for a beat
  // right after the first question before the clarifying chat appears. We track
  // which kind of processing is in flight so dialogue-creation shows the live
  // chat (the user's question + typing) immediately instead.
  const [processingKind, setProcessingKind] = useState<"dialogue" | "answer">("answer");
  const autoStartedRef = useRef(false);
  // Issue #3: the clarifying chat scrolls inside its own bounded frame
  // (Telegram-like) instead of growing the page — keep it pinned to the bottom.
  const clarifyThreadRef = useRef<HTMLDivElement>(null);
  // Telegram-like composer: 1 line → grows to 4 → scrolls.
  const { ref: clarificationRef } = useAutoGrowTextarea(clarification);

  const primaryAnswer = dialogue?.primaryAnswer?.content
    ?? [...(dialogue?.messages ?? [])].reverse().find((message) => message.role === "ASSISTANT" && dialogue?.status === "ANSWERED")?.content
    ?? "";
  const safeAnswer = useMemo(() => cleanAnswer(primaryAnswer), [primaryAnswer]);
  // Task 6: «Если хочется глубже» recommendation prose is removed from the разбор —
  // recommendations live in the dedicated «можно посмотреть глубже» block below.
  // Strip it on display for разборы persisted before the prompt change.
  const displayAnswer = useMemo(() => stripDeepeningSection(primaryAnswer), [primaryAnswer]);
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

  // Issue #3: keep the clarifying thread pinned to the bottom on each new turn by
  // scrolling INSIDE the bounded frame (never the page), so the composer stays put.
  useEffect(() => {
    const el = clarifyThreadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [clarifyingAnswers.length, awaitingAssistant, currentClarifyingQuestion?.question, phase]);

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
    setProcessingKind("dialogue");
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
    setProcessingKind("answer");
    setPhase("processing");

    try {
      const data = await requestJson<{ dialogue: DialoguePayload; generated: boolean }>(`/api/dialogues/${dialogueId}/answer`, {
        method: "POST",
      });
      setDialogue(data.dialogue);
      const answer = stripDeepeningSection(data.dialogue.primaryAnswer?.content ?? "");
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
    setProcessingKind("answer");
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
        setProcessingKind("answer");
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
    // B414: a signed-in user's разбор is already persisted server-side (the
    // dialogue is created under their userId). "empty" (no guest draft to
    // claim) is therefore a success, not an error — the result IS in their map.
    setSaveState(persisted.saved || persisted.reason === "empty" ? "saved" : "error");
  }

  // B414: registered users никогда не жмут «Сохранить в карту» — разбор
  // сохраняется автоматически. On reaching the result we auto-claim any pending
  // guest draft (no-op if there's none) so the разбор lands in their map. The
  // state is set only after the await, never synchronously in the effect body.
  useEffect(() => {
    if (phase !== "result" || status !== "authenticated" || saveState !== "idle") return;
    let active = true;
    void (async () => {
      const persisted = await persistGuestResultDraftToAccount();
      if (!active) return;
      setSaveState(persisted.saved || persisted.reason === "empty" ? "saved" : "error");
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, status]);

  return (
    <DialogueShell
      className="soft-clarity-page soft-dialogue-page"
      hideHeader={phase === "result"}
      title={phase === "result" ? "Ваш первичный ответ" : phase === "safety" ? "Экстренная поддержка" : "Разбор"}
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
              {/* B416: the daily/monthly limit is no longer an inline note — it
                  is a blocking popup rendered below (see LimitPopup overlay). */}
              <div className="soft-ask-foot">
                <p className="text-xs leading-relaxed text-[var(--soft-ink-faint)]">
                  {restoring ? "Восстанавливаю сохраненный диалог..." : "Первый разбор — бесплатно."}
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
        // Issue #3: Telegram-like — the thread scrolls inside a bounded frame and
        // the composer is pinned at the bottom of the first screen.
        <div className="soft-chat-screen" data-testid="dialogue-clarifying-step">
          <div ref={clarifyThreadRef} className="soft-dialogue-chat soft-chat-thread">
          <div className="soft-msg-row soft-msg-row-user">
            <UserMsgAvatar />
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
                <UserMsgAvatar />
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

          </div>{/* /soft-chat-thread */}

          {/* B318: the composer stays visible at all times; we just lock it
              while we wait for the next turn so the user can see exactly
              where their next reply will go. Pinned at the bottom of the frame. */}
          <div className="soft-ask-card soft-dialogue-composer">
            <label htmlFor="dialogue-clarification" className="sr-only">Ответ на уточнение</label>
            <textarea
              id="dialogue-clarification"
              ref={clarificationRef}
              value={clarification}
              onChange={(event) => setClarification(event.target.value.slice(0, DIALOGUE_INPUT_MAX_CHARS))}
              placeholder={awaitingAssistant
                ? "Подождите, платформа сейчас сформулирует следующий вопрос…"
                : "Ответьте своими словами или выберите вариант выше…"}
              className="soft-question-input soft-dialogue-composer-input"
              rows={1}
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

      {/* Issue #1: dialogue-creation processing — show the live chat immediately
          (the user's question + a typing indicator) so «сразу после вопроса
          появляется диалог», never the «что я слышу» band that belongs to the
          final разбор. The clarifying phase takes over the moment the first
          question arrives. */}
      {phase === "processing" && processingKind === "dialogue" && (
        <div className="soft-dialogue-chat" data-testid="dialogue-starting-step">
          <div className="soft-msg-row soft-msg-row-user">
            <UserMsgAvatar />
            <div className="soft-msg-bubble soft-msg-bubble-user">{question}</div>
          </div>
          <div className="soft-msg-row soft-msg-row-assistant" data-testid="dialogue-typing-indicator">
            <div className="soft-msg-avatar" aria-hidden="true" />
            <div className="soft-msg-bubble soft-msg-bubble-assistant">
              <div className="soft-typing"><span /><span /><span /></div>
            </div>
          </div>
        </div>
      )}

      {phase === "processing" && processingKind === "answer" && (
        // B411: no separate "generation page" that crops the dialogue down to
        // the first question. While the разбор is being written we render the
        // SAME single-screen scaffold as the result — the full dialogue stays
        // available in the collapsible «Первичный разбор», and «что я слышу…»
        // shows a typing state in place.
        <div className="soft-answer-flow" data-testid="dialogue-processing-step">
          {(dialogue?.messages ?? []).filter((m) => m.role !== "SYSTEM" && m.content.trim()).length > 0 && (
            <details className="soft-razbor-disclosure mb-4 rounded-[var(--soft-radius-lg)] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4">
              <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-2">
                <span className="soft-eyebrow">первичный разбор</span>
                <span className="text-xs text-[var(--soft-ink-faint)]">показать диалог</span>
              </summary>
              <div className="mt-3">
                <DialogueThread messages={dialogue?.messages ?? []} />
              </div>
            </details>
          )}
          <article
            className="relative overflow-hidden rounded-[var(--soft-radius-lg)] border border-[var(--soft-paper-edge)] p-5 md:p-7"
            style={{ background: "linear-gradient(160deg, #FFFCF5 0%, #F8E6D1 100%)" }}
          >
            <span aria-hidden="true" className="absolute left-0 top-0 h-full w-1.5" style={{ background: "var(--soft-terracotta-dark)" }} />
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="font-heading text-2xl leading-none text-[var(--soft-terracotta-dark)]">“</span>
              <p className="soft-eyebrow">что я слышу в вашем вопросе</p>
            </div>
            <div className="soft-typing mt-4" aria-label="Готовим разбор">
              <span /><span /><span />
            </div>
          </article>
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
          {/* iOS-style header: round «back» arrow (= новый разбор) directly left
              of the title, with a quiet privacy line — mirrors the redesigned
              product hero (`products/[slug]/page.tsx`). Replaces the old loud
              status/price badge row. */}
          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-1.5">
              <button
                type="button"
                onClick={reset}
                aria-label="Новый разбор"
                data-testid="dialogue-result-back"
                className="-ml-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--soft-ink-soft)] transition-colors hover:bg-[var(--soft-paper-card)] hover:text-[var(--soft-bordeaux)]"
              >
                <ChevronLeft className="size-5" aria-hidden="true" />
              </button>
              <h1 className="soft-h2 truncate" style={{ margin: 0 }}>Ваш разбор</h1>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-[var(--soft-terracotta-dark)]">
              <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
              Приватно
            </span>
          </div>
          {/* B411: full dialogue collapsed into «Первичный разбор», ABOVE «что я
              слышу». Collapsed by default, same bubble structure as the live chat.
              Task 7: hidden while the chat continuation is open — the chat itself
              is seeded with the разбор + thread, so showing it twice is noise. */}
          {(() => {
            const thread = (dialogue.messages ?? []).filter(
              (m) => m.role !== "SYSTEM" && m.content.trim() && m.content !== primaryAnswer,
            );
            if (thread.length === 0) return null;
            return (
              <details
                className="soft-razbor-disclosure mb-4 rounded-[var(--soft-radius-lg)] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4"
                data-testid="dialogue-history"
                open={historyOpen}
                onToggle={(event) => setHistoryOpen((event.currentTarget as HTMLDetailsElement).open)}
              >
                <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
                  <span className="soft-eyebrow">первичный разбор</span>
                  <span className="text-xs text-[var(--soft-ink-faint)]">{historyOpen ? "скрыть диалог" : "показать диалог"}</span>
                </summary>
                <div className="mt-3">
                  <DialogueThread messages={thread} />
                </div>
              </details>
            );
          })()}

          {/* B411: «что я слышу в вашем вопросе» — horizontal band, full width. */}
          <article
            className="relative overflow-hidden rounded-[var(--soft-radius-lg)] border border-[var(--soft-paper-edge)] p-5 md:p-7"
            style={{ background: "linear-gradient(160deg, #FFFCF5 0%, #F8E6D1 100%)" }}
          >
            <span aria-hidden="true" className="absolute left-0 top-0 h-full w-1.5" style={{ background: "var(--soft-terracotta-dark)" }} />
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="font-heading text-2xl leading-none text-[var(--soft-terracotta-dark)]">“</span>
              <p className="soft-eyebrow">что я слышу в вашем вопросе</p>
            </div>
            <div data-testid="dialogue-primary-answer">
              <SoftMarkdown
                content={displayAnswer}
                className="mt-3 font-heading text-[19px] text-[var(--soft-ink)] [&_p]:leading-relaxed"
              />
            </div>
          </article>

          {/* B412: recommendations directly under «что я слышу», by priority, on
              one screen. Row 1 = «Продолжить в чате» + «Подобрано для вас» (one
              line); row 2 = «Другие форматы» (smaller) with the specialist
              session elevated. Every card carries its price. */}
          <section className="mt-5" data-testid="dialogue-answer-triage-layout" aria-label="Что можно сделать дальше">
            <p className="soft-eyebrow text-[var(--soft-terracotta-dark)]">можно посмотреть глубже</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 sm:items-stretch" data-testid="dialogue-triage-rail">
              {/* priority 1: продолжить разговор в чате — issue #5: opens the /chat
                  SERVICE keyed to this dialogue (?dialogueId=…&start=1) so the URL
                  reflects the service + session and a refresh restores the chat.
                  Guests pass through /login first; authed users go straight in. */}
              <button
                type="button"
                className="soft-card soft-triage-primary flex w-full flex-col p-5 text-left"
                data-testid="continue-in-chat-cta"
                data-analytics-surface="checkin_triage"
                data-analytics-event="triage_primary_clicked"
                data-analytics-target={`/products/chat?dialogueId=${dialogue.id}`}
                data-analytics-product="companion-chat"
                data-analytics-dialogue-id={dialogue.id}
                data-analytics-cta-role="primary"
                data-analytics-offer-id="companion_chat_after_free_answer"
                data-analytics-offer-reason="live_dialogue_continuation"
                onClick={() => {
                  track({ event: "companion_chat_cta_clicked", surface: "checkin", dialogueId: dialogue.id });
                  const next = `/products/chat?dialogueId=${dialogue.id}&start=1`;
                  if (status !== "authenticated") {
                    window.location.href = `${loginUrl()}?next=${encodeURIComponent(next)}`;
                    return;
                  }
                  window.location.href = next;
                }}
              >
                <span className="soft-triage-ribbon">продолжить в диалоге</span>
                <div className="mt-2 flex items-start gap-3">
                  <MessageSquareText className="mt-1 size-6 shrink-0 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
                  <div>
                    <h3 className="soft-h3">Продолжить разговор в чате</h3>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                      Живой диалог в своём темпе — 45 минут, чтобы разобрать вопрос глубже.
                    </p>
                  </div>
                </div>
                <div className="mt-auto flex items-end justify-between gap-4 pt-5">
                  <div>
                    <div className="font-heading text-2xl font-semibold leading-none text-[var(--soft-bordeaux)]">790 ₽</div>
                    <div className="mt-1 text-[11px] text-[var(--soft-ink-faint)]">45 мин · или 4 балла</div>
                  </div>
                  <span className="soft-button soft-button-primary text-sm">
                    Начать
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </span>
                </div>
              </button>

              {/* priority 2: подобрано для вас (the topic-aware paid format) */}
              {productRecommendation && productRecommendation.slug !== "perspectives" ? (
                <Link
                  href={`${productRecommendation.href}?dialogueId=${dialogue.id}`}
                  className="soft-card soft-triage-primary flex flex-col p-5"
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
                  <span className="soft-triage-ribbon">подобрано для вас</span>
                  <div className="mt-2 flex items-start gap-3">
                    <Compass className="mt-1 size-6 shrink-0 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
                    <div>
                      <h3 className="soft-h3">{productRecommendation.name}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                        {productRecommendation.reason}
                      </p>
                    </div>
                  </div>
                  <div className="mt-auto flex items-end justify-between gap-4 pt-5">
                    <div>
                      <div className="font-heading text-2xl font-semibold leading-none text-[var(--soft-bordeaux)]">{productRecommendation.price ?? "299 ₽"}</div>
                      {productRecommendation.creditCost != null && (
                        <div className="mt-1 text-[11px] text-[var(--soft-ink-faint)]">или −{productRecommendation.creditCost} {pointsWord(productRecommendation.creditCost)}</div>
                      )}
                    </div>
                    <span className="soft-button soft-button-primary text-sm">
                      Открыть
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </span>
                  </div>
                </Link>
              ) : (
                <Link
                  href={`/products/perspectives?dialogueId=${dialogue.id}`}
                  className="soft-card soft-triage-primary flex flex-col p-5"
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
                  <span className="soft-triage-ribbon">подобрано для вас</span>
                  <div className="mt-2 flex items-start gap-3">
                    <Compass className="mt-1 size-6 shrink-0 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
                    <div>
                      <h3 className="soft-h3">Полная картина</h3>
                      <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                        {productRecommendation?.reason ?? "Похоже на запрос про решение. Разложим ситуацию на разум, чувства, символ и действие."}
                      </p>
                    </div>
                  </div>
                  <div className="mt-auto flex items-end justify-between gap-4 pt-5">
                    <div>
                      <div className="font-heading text-2xl font-semibold leading-none text-[var(--soft-bordeaux)]">{productRecommendation?.price ?? "299 ₽"}</div>
                      <div className="mt-1 text-[11px] text-[var(--soft-ink-faint)]">
                        {productRecommendation?.creditCost != null ? `или −${productRecommendation.creditCost} ${pointsWord(productRecommendation.creditCost)}` : "или −1 балл"}
                      </div>
                    </div>
                    <span className="soft-button soft-button-primary text-sm">
                      Открыть
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </span>
                  </div>
                </Link>
              )}
            </div>

            <p className="soft-eyebrow mt-5">другие форматы</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2" data-testid="triage-secondary-options">
              {/* W17: topic-adjacent products from the recommendation API,
                  deduped against the primary recommendation. */}
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
                        <span className="block text-[11px] text-[var(--soft-ink-faint)]">или −{item.creditCost} {pointsWord(item.creditCost)}</span>
                      )}
                    </span>
                    <span className="font-heading font-semibold text-[var(--soft-bordeaux)]">{item.price}</span>
                  </Link>
                );
              })}
              {/* B412: the specialist session is elevated above the digital
                  formats — accent ring + «человек рядом» tag, spanning the row. */}
              {recommendations.length > 0 ? (
                recommendations.slice(0, 1).map((rec) => (
                  <Link
                    key={rec.id}
                    href={`/practitioners/${rec.slug}?dialogueId=${dialogue.id}`}
                    className="soft-triage-option sm:col-span-2 ring-1 ring-[var(--soft-terracotta-dark)] bg-[var(--soft-paper-card)]"
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
                      <span className="flex items-center gap-2">
                        <span className="block truncate font-medium text-[var(--soft-ink)]">{rec.name ?? "Специалист"}</span>
                        <span className="rounded-full bg-[var(--soft-terracotta-dark)] px-2 py-0.5 text-[9px] uppercase tracking-wide text-[#FBF0E1]">человек рядом</span>
                      </span>
                      <span className="block truncate text-[11px] text-[var(--soft-ink-faint)]">{rec.rationale}</span>
                    </span>
                    <span className="font-heading font-semibold text-[var(--soft-bordeaux)]">от {rec.pricePerSession.toLocaleString("ru-RU")} ₽</span>
                  </Link>
                ))
              ) : (
                <Link
                  href={`/practitioners?dialogueId=${dialogue.id}`}
                  className="soft-triage-option sm:col-span-2 ring-1 ring-[var(--soft-terracotta-dark)] bg-[var(--soft-paper-card)]"
                  data-testid="specialist-recommendation"
                  data-analytics-surface="checkin_triage"
                  data-analytics-event="triage_secondary_clicked"
                  data-analytics-target={`/practitioners?dialogueId=${dialogue.id}`}
                  data-analytics-product="specialist"
                  data-analytics-dialogue-id={dialogue.id}
                  data-analytics-cta-role="secondary"
                  data-analytics-offer-id="specialist_catalog_fallback"
                  data-analytics-offer-reason="human_continuation_after_context"
                  data-analytics-price-rub={MIN_SESSION_PRICE_RUB}
                >
                  <Heart className="size-4 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="block truncate font-medium text-[var(--soft-ink)]">Встреча со специалистом</span>
                      <span className="rounded-full bg-[var(--soft-terracotta-dark)] px-2 py-0.5 text-[9px] uppercase tracking-wide text-[#FBF0E1]">человек рядом</span>
                    </span>
                    <span className="block text-[11px] text-[var(--soft-ink-faint)]">живое сопровождение, когда нужно</span>
                  </span>
                  <span className="font-heading font-semibold text-[var(--soft-bordeaux)]">{formatSessionFloor()}</span>
                </Link>
              )}
            </div>

            {/* W17: API-chosen subscription nudge (Plus/Premium), hidden for free
                products / sessions / existing subscribers. */}
            {subscriptionRec && (
              <div className="soft-card mt-4 p-4" style={{ background: "var(--soft-paper-deep)" }} data-testid="triage-subscription-option">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex gap-3">
                    <Sparkles className="mt-1 size-4 shrink-0 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
                    <div>
                      <p className="soft-eyebrow text-[10px]">если планируете возвращаться</p>
                      <h3 className="mt-1 font-heading text-base font-semibold text-[var(--soft-bordeaux)]">
                        {subscriptionRec.reason}
                      </h3>
                    </div>
                  </div>
                  <Link
                    href="/pricing"
                    className="soft-chip shrink-0"
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
                    {subscriptionRec.priceRub.toLocaleString("ru-RU")} ₽/мес →
                  </Link>
                </div>
              </div>
            )}
          </section>

          {/* B414: actions row. Registered users see «сохранено в карте» (auto-
              saved); guests get a save action that opens the full /login page.
              «Поделиться» is icon-only. */}
          <div className="mt-5 flex flex-wrap items-center gap-2" data-testid="dialogue-free-continuation-actions">
            {status === "authenticated" ? (
              saveState === "error" ? (
                <button type="button" onClick={handleSaveToAccount} className="soft-button soft-button-soft" data-testid="result-save-retry">
                  <Bookmark className="size-4" aria-hidden="true" />
                  Сохранить в карту
                </button>
              ) : (
                <AutosavedNote
                  testId="result-autosaved-note"
                  label={saveState === "saving" ? "Сохраняем в карту…" : "Сохранено в Дневнике автоматически"}
                />
              )
            ) : (
              <Link href="/login?intent=save-result" className="soft-button soft-button-primary" data-testid="save-result-login">
                <Bookmark className="size-4" aria-hidden="true" />
                Сохранить в карту
              </Link>
            )}
          </div>

          {status !== "authenticated" && (
            <p className="mt-4 text-sm text-[var(--soft-ink-soft)]">
              Ответ сохранится после входа. Уже есть аккаунт?{" "}
              <Link href="/login?intent=save-result" className="font-medium text-[var(--soft-terracotta-dark)] hover:underline">
                Войти
              </Link>
            </p>
          )}
          {saveState === "error" && status !== "authenticated" && <p className="mt-3 text-sm text-destructive">Не удалось сохранить. Попробуйте еще раз.</p>}

          {/* Issue #9: one universal reflective-use disclaimer, same wording and
              placement as every other digital service (replaces the old «Важно:
              это не медицинская…» paragraph that used to live inside the разбор). */}
          <ProductDisclaimer />
        </div>
      )}

      {error && phase !== "processing" && <p className="mt-4 text-sm text-destructive">{error}</p>}

      {/* B416: blocking limit popup. Fires when the free-разбор limit is hit on
          start. Never shown during a safety interrupt (monetization is never
          surfaced over a distressed user). Copy = business-analyst + marketer +
          practicing-psychologist pass: warm, honest, no scarcity, always an exit. */}
      {limitPaywall && phase !== "safety" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(42,36,34,0.32)] px-4 py-8 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dialogue-limit-title"
          data-testid="dialogue-limit-paywall"
          onClick={() => setLimitPaywall(null)}
        >
          <div
            className="w-full max-w-md rounded-[var(--soft-radius-lg)] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-6 shadow-[var(--soft-shadow-md)]"
            onClick={(event) => event.stopPropagation()}
          >
            {limitPaywall.cta === "register" ? (
              <>
                <p className="soft-eyebrow">бесплатный разбор</p>
                <h2 id="dialogue-limit-title" className="mt-2 font-heading text-xl font-semibold text-[var(--soft-bordeaux)]">
                  Ваш первый разбор готов
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                  Это был бесплатный разбор без регистрации. Чтобы сохранить его и сделать следующий, заведите аккаунт — это бесплатно и займёт минуту. Ваши вопросы останутся приватными.
                </p>
                <div className="mt-5 flex flex-col gap-2">
                  <Link
                    href="/register?intent=continue-dialogue"
                    className="soft-button soft-button-primary justify-center"
                    data-testid="register-to-continue"
                    onClick={() => track({ event: "dialogue_limit_register_clicked", surface: "checkin", properties: limitPaywall })}
                  >
                    Создать аккаунт
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                  <Link href="/login" className="soft-button soft-button-soft justify-center">
                    Войти
                  </Link>
                  <button type="button" className="soft-button soft-button-ghost justify-center" onClick={() => setLimitPaywall(null)}>
                    Пока не сейчас
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="soft-eyebrow">дневной ритм</p>
                <h2 id="dialogue-limit-title" className="mt-2 font-heading text-xl font-semibold text-[var(--soft-bordeaux)]">
                  На сегодня — достаточно
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                  Вы уже сделали {limitPaywall.limit ?? 3} разбора сегодня. Иногда мыслям нужно время, чтобы улечься. Завтра бесплатные разборы снова откроются — а если хочется разобрать вопрос глубже прямо сейчас, есть форматы без ограничений.
                </p>
                <div className="mt-5 flex flex-col gap-2">
                  <Link
                    href="/products"
                    className="soft-button soft-button-primary justify-center"
                    data-testid="dialogue-limit-explore-formats"
                    onClick={() => track({ event: "dialogue_limit_explore_clicked", surface: "checkin", properties: limitPaywall })}
                  >
                    Разобрать глубже сейчас
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                  <Link
                    href="/pricing#plus"
                    className="soft-button soft-button-soft justify-center"
                    data-testid="upgrade-to-plus"
                    onClick={() => track({ event: "dialogue_limit_upgrade_clicked", surface: "checkin", properties: limitPaywall })}
                  >
                    Узнать о Plus
                  </Link>
                  <button type="button" className="soft-button soft-button-ghost justify-center" onClick={() => setLimitPaywall(null)}>
                    Вернусь завтра
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </DialogueShell>
  );
}
