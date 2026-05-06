"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowRight, Bookmark, CheckCircle2, Compass, Loader2, RotateCcw, Send, ShieldCheck } from "lucide-react";
import { AIShareButton } from "@/components/ai-share-button";
import { DialogueShell } from "@/components/dialogue/dialogue-shell";
import { Button } from "@/components/ui/button";
import { Disclaimer } from "@/components/ui/disclaimer";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { persistGuestResultDraftToAccount, saveGuestResultDraft } from "@/lib/guest-result-cache";

type DialogueMessage = {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  createdAt: string;
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
  const [dialogue, setDialogue] = useState<DialoguePayload | null>(null);
  const [phase, setPhase] = useState<"question" | "clarifying" | "processing" | "result" | "safety">("question");
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [retrying, setRetrying] = useState(false);

  const primaryAnswer = dialogue?.primaryAnswer?.content
    ?? [...(dialogue?.messages ?? [])].reverse().find((message) => message.role === "ASSISTANT" && dialogue?.status === "ANSWERED")?.content
    ?? "";
  const safeAnswer = useMemo(() => cleanAnswer(primaryAnswer), [primaryAnswer]);

  useEffect(() => {
    if (phase === "result" || phase === "safety") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [phase]);

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

  async function sendClarification(skip = false) {
    if (!dialogue) return;
    if (!skip && !clarification.trim()) return;
    setError("");
    setPhase("processing");

    try {
      const data = await requestJson<{ dialogue: DialoguePayload }>(`/api/dialogues/${dialogue.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(skip ? { action: "skip_clarifications" } : { message: clarification.trim() }),
      });
      setDialogue(data.dialogue);
      setClarification("");
      await generateAnswer(data.dialogue.id);
    } catch (err) {
      setPhase("clarifying");
      setError(err instanceof Error ? err.message : "Не удалось отправить уточнение");
    }
  }

  function reset() {
    setQuestion("");
    setClarification("");
    setDialogue(null);
    setPhase("question");
    setError("");
    setSaveState("idle");
    setRetrying(false);
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
      <PublicJsonLd route="/all-modalities/checkin" />

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
                  Регистрация понадобится только если вы захотите сохранить результат.
                </p>
                <Button
                  onClick={startDialogue}
                  disabled={question.trim().length < 3}
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
            <div>
              <div className="soft-msg-bubble soft-msg-bubble-assistant">
                <p>Спасибо, что доверились. Чтобы яснее увидеть ситуацию, разрешите задать пару коротких вопросов — это правда помогает.</p>
                <div className="mt-4 space-y-2">
                  {(dialogue.clarifyingQuestions ?? []).map((item, index) => (
                    <p key={item} data-testid="dialogue-clarifying-question">
                      {index + 1}. {item}
                    </p>
                  ))}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {["Понять, что происходит", "Решить, что делать", "И то, и другое"].map((item) => (
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

          <div className="soft-ask-card soft-dialogue-composer">
            <label htmlFor="dialogue-clarification" className="sr-only">Ответ на уточнение</label>
            <textarea
              id="dialogue-clarification"
              value={clarification}
              onChange={(event) => setClarification(event.target.value)}
              placeholder="Ответьте одним сообщением или пропустите уточнения."
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
                Пропустить
              </Button>
              <Button
                onClick={() => sendClarification(false)}
                disabled={!clarification.trim()}
                className="soft-button soft-button-primary"
                data-testid="dialogue-send-clarification"
              >
                Продолжить
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
          <div className="mb-5 flex flex-wrap gap-2">
            <span className="soft-badge">
              <CheckCircle2 className="size-3" aria-hidden="true" />
              разбор готов
            </span>
            <span className="soft-badge soft-badge-warm">бесплатно</span>
            {dialogue.topic && <span className="soft-chip">Тема: {dialogue.topic}</span>}
            {dialogue.difficulty && <span className="soft-chip">Сложность: {dialogue.difficulty}</span>}
          </div>

          <article className="soft-card p-5 md:p-7">
            <p className="soft-eyebrow">что я слышу в вашем вопросе</p>
            <div className="mt-3 whitespace-pre-wrap font-heading text-[1.18rem] leading-relaxed text-[var(--soft-ink)]" data-testid="dialogue-primary-answer">
              {safeAnswer}
            </div>
          </article>

          <section className="soft-card-flat mt-4 p-5 md:p-7">
            <p className="soft-eyebrow text-[var(--soft-terracotta-dark)]">главная развилка</p>
            <h2 className="soft-h3 mt-2">Это про решение прямо сейчас — или про ясность, которой пока не хватает?</h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
              Первичный ответ помогает увидеть контур. Если хочется не спешить, можно сохранить его, вернуться позже или углубить в один из следующих форматов.
            </p>
          </section>

          <section className="soft-card mt-4 p-5 md:p-7">
            <p className="soft-eyebrow">один бережный шаг сегодня</p>
            <h2 className="soft-h3 mt-2 italic">Запишите одну фразу, которую вы давно хотели сказать себе честно.</h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
              Не отправлять, не доказывать, не решать все сразу. Просто дать мысли форму и посмотреть, что в ней правда.
            </p>
          </section>

          <div className="mt-5">
            <AIShareButton tool="CHECKIN" title="Первичный ответ ETerapy" resultText={safeAnswer} />
          </div>

          <div className="mt-6 flex flex-wrap gap-3" data-testid="dialogue-result-actions">
            {status === "authenticated" ? (
              <Button
                onClick={handleSaveToAccount}
                disabled={saveState === "saving" || saveState === "saved"}
                className="soft-button soft-button-primary"
                data-testid="save-result-authenticated"
              >
                <Bookmark className="size-4" aria-hidden="true" />
                {saveState === "saved" ? "Сохранено в кабинете" : saveState === "saving" ? "Сохраняем..." : "Сохранить в кабинет"}
              </Button>
            ) : (
              <Link href="/register?intent=save-result" className="soft-button soft-button-primary" data-testid="save-result-register">
                <Bookmark className="size-4" aria-hidden="true" />
                Сохранить ответ
              </Link>
            )}
            <Link href={`/products/deep-report?dialogueId=${dialogue.id}`} className="soft-button soft-button-ghost" data-testid="dialogue-deepen-report">
              <Compass className="size-4" aria-hidden="true" />
              Углубить ответ
            </Link>
            <Link href={`/products/perspectives?dialogueId=${dialogue.id}`} className="soft-button soft-button-ghost" data-testid="dialogue-deepen-perspectives">
              Посмотреть перспективы
            </Link>
            <Button onClick={reset} variant="ghost" className="soft-button soft-button-ghost" data-testid="dialogue-reset">
              <RotateCcw className="size-4" aria-hidden="true" />
              Задать новый вопрос
            </Button>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <Link href={`/products/perspectives?dialogueId=${dialogue.id}`} className="soft-card soft-deepening-card">
              <p className="soft-eyebrow">рекомендуем</p>
              <h3 className="soft-h3 mt-2">Ракурсы ответа</h3>
              <p className="mt-2 text-sm text-[var(--soft-ink-soft)]">Разум, чувства, символ и действие на одну страницу.</p>
              <span className="soft-badge soft-badge-warm mt-4">от 299 ₽</span>
            </Link>
            <Link href="/products/seven-days" className="soft-card soft-deepening-card">
              <p className="soft-eyebrow">маршрут</p>
              <h3 className="soft-h3 mt-2">7 дней к ясности</h3>
              <p className="mt-2 text-sm text-[var(--soft-ink-soft)]">Если хочется не быстрого ответа, а бережного разговора с собой.</p>
              <span className="soft-badge soft-badge-warm mt-4">990 ₽</span>
            </Link>
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
