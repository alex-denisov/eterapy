"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowRight, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { AIShareButton } from "@/components/ai-share-button";
import { DialogueShell } from "@/components/dialogue/dialogue-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Disclaimer } from "@/components/ui/disclaimer";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { buttonVariants } from "@/lib/button-variants";
import { persistGuestResultDraftToAccount, saveGuestResultDraft } from "@/lib/guest-result-cache";
import { cn } from "@/lib/utils";

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
      title={phase === "result" ? "Ваш первичный ответ" : phase === "safety" ? "Сначала безопасность" : "Задайте вопрос"}
      description={
        phase === "result"
          ? "Это первый слой ответа. Его можно сохранить, отправить себе или углубить."
          : phase === "safety"
            ? "В этом сценарии ETerapy не показывает платные действия и не заменяет срочную помощь."
            : "Напишите ситуацию своими словами. Диалог уточнит контекст и даст бесплатный первичный ответ."
      }
      progress={progress}
    >
      <PublicJsonLd route="/all-modalities/checkin" />

      {phase === "question" && (
        <div data-testid="dialogue-question-step">
          <Card className="border-border/40 bg-card/50">
            <CardContent className="p-5">
              <label htmlFor="dialogue-question" className="text-sm font-medium text-foreground">
                Что сейчас хочется понять?
              </label>
              <textarea
                id="dialogue-question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Например: почему я застрял в этом выборе и какой следующий шаг будет бережным?"
                className="mt-3 min-h-36 w-full resize-none rounded-[var(--radius-control)] border border-border/40 bg-background/60 px-4 py-3 text-base leading-relaxed outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                rows={5}
                data-testid="dialogue-question-input"
              />
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button onClick={startDialogue} disabled={question.trim().length < 3} className="min-h-10" data-testid="dialogue-start-button">
                  Получить первый ответ
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Button>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Регистрация понадобится только если вы захотите сохранить результат.
                </p>
              </div>
            </CardContent>
          </Card>
          <Disclaimer className="mt-5" tone="info" title="Ограничение">
            Сервис не является медицинской, юридической, финансовой или психологической консультацией.
          </Disclaimer>
        </div>
      )}

      {phase === "clarifying" && dialogue && (
        <div data-testid="dialogue-clarifying-step">
          <div className="space-y-3">
            <div className="rounded-[var(--radius-card)] border border-border/35 bg-card/40 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Ваш вопрос</p>
              <p className="mt-2 text-sm leading-relaxed">{question || dialogue.title}</p>
            </div>
            <Card className="border-primary/20 bg-card/55">
              <CardContent className="p-5">
                <Badge variant="outline" className="border-primary/30 text-primary">
                  <Sparkles className="size-3" aria-hidden="true" />
                  Уточнение
                </Badge>
                <div className="mt-4 space-y-2 text-sm leading-relaxed text-foreground/90">
                  {(dialogue.clarifyingQuestions ?? []).map((item, index) => (
                    <p key={item} data-testid="dialogue-clarifying-question">
                      {index + 1}. {item}
                    </p>
                  ))}
                </div>
                <textarea
                  value={clarification}
                  onChange={(event) => setClarification(event.target.value)}
                  placeholder="Ответьте одним сообщением или пропустите уточнения."
                  className="mt-4 min-h-28 w-full resize-none rounded-[var(--radius-control)] border border-border/40 bg-background/60 px-4 py-3 text-sm leading-relaxed outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                  rows={4}
                  data-testid="dialogue-clarification-input"
                />
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <Button onClick={() => sendClarification(false)} disabled={!clarification.trim()} data-testid="dialogue-send-clarification">
                    Продолжить
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Button>
                  <Button variant="outline" onClick={() => sendClarification(true)} data-testid="dialogue-skip-clarification">
                    Пропустить
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {phase === "processing" && (
        <div className="flex min-h-72 flex-col items-center justify-center rounded-[var(--radius-card)] border border-border/35 bg-card/40 px-5 text-center" data-testid="dialogue-processing-step">
          <div className="relative">
            <div className="h-16 w-16 animate-pulse rounded-full bg-[radial-gradient(circle,var(--dialogue-halo-core),transparent_68%)] shadow-[var(--shadow-halo-soft)]" />
            <Loader2 className="absolute inset-0 m-auto size-6 animate-spin text-primary" aria-hidden="true" />
          </div>
          <p className="mt-5 text-base font-medium text-foreground">Готовлю ответ</p>
          <div className="mt-3 space-y-1 text-sm text-muted-foreground">
            {processingLines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
          {error && (
            <div className="mt-5">
              <p className="text-sm text-destructive">{error}</p>
              {retrying && dialogue && (
                <Button className="mt-3" variant="outline" onClick={() => generateAnswer(dialogue.id)} data-testid="dialogue-retry-answer">
                  Попробовать еще раз
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {phase === "safety" && (
        <div data-testid="dialogue-safety-interrupt">
          <Disclaimer tone="warning" title="Похоже, тут нужен безопасный следующий шаг">
            Если есть риск причинить вред себе или другому человеку, обратитесь в экстренные службы или к близкому человеку рядом. ETerapy не будет предлагать платные продукты в таком сценарии.
          </Disclaimer>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Button variant="outline" onClick={reset}>
              <RotateCcw className="size-4" aria-hidden="true" />
              Задать другой вопрос
            </Button>
            <Link href="/legal/ethics" className={cn(buttonVariants({ variant: "ghost" }), "text-muted-foreground")}>
              Принципы безопасности
            </Link>
          </div>
        </div>
      )}

      {phase === "result" && dialogue && safeAnswer && (
        <div data-testid="dialogue-result-step">
          <Card className="border-primary/20 bg-card/35">
            <CardContent className="p-5">
              <div className="mb-4 flex flex-wrap gap-2">
                {dialogue.topic && <Badge variant="outline">Тема: {dialogue.topic}</Badge>}
                {dialogue.difficulty && <Badge variant="outline">Сложность: {dialogue.difficulty}</Badge>}
              </div>
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90" data-testid="dialogue-primary-answer">
                {safeAnswer}
              </div>
            </CardContent>
          </Card>

          <AIShareButton tool="CHECKIN" title="Первичный ответ ETerapy" resultText={safeAnswer} />

          <div className="mt-6 grid gap-3 sm:grid-cols-2" data-testid="dialogue-result-actions">
            {status === "authenticated" ? (
              <Button onClick={handleSaveToAccount} disabled={saveState === "saving" || saveState === "saved"} data-testid="save-result-authenticated">
                {saveState === "saved" ? "Сохранено в кабинете" : saveState === "saving" ? "Сохраняем..." : "Сохранить в кабинет"}
              </Button>
            ) : (
              <Link href="/register?intent=save-result" className={cn(buttonVariants(), "min-h-10")} data-testid="save-result-register">
                Сохранить ответ
              </Link>
            )}
            <Link href="/products/deep-report" className={cn(buttonVariants({ variant: "outline" }), "min-h-10")} data-testid="dialogue-deepen-report">
              Углубить ответ
            </Link>
            <Link href="/products/perspectives" className={cn(buttonVariants({ variant: "outline" }), "min-h-10")} data-testid="dialogue-deepen-perspectives">
              Посмотреть перспективы
            </Link>
            <Button onClick={reset} variant="ghost" className="text-muted-foreground" data-testid="dialogue-reset">
              <RotateCcw className="size-4" aria-hidden="true" />
              Задать новый вопрос
            </Button>
          </div>

          {status !== "authenticated" && (
            <p className="mt-3 text-sm text-muted-foreground">
              Ответ сохранится после регистрации. Уже есть аккаунт?{" "}
              <Link href="/login?intent=save-result" className="text-primary hover:underline">
                Войти
              </Link>
            </p>
          )}
          {saveState === "error" && <p className="mt-3 text-sm text-destructive">Не удалось сохранить. Попробуйте еще раз.</p>}
          <Disclaimer className="mt-6" tone="info" title="Ограничение">
            Первичный ответ помогает увидеть следующий шаг, но не заменяет профильную помощь и не является прогнозом с гарантией.
          </Disclaimer>
        </div>
      )}

      {error && phase !== "processing" && <p className="mt-4 text-sm text-destructive">{error}</p>}
    </DialogueShell>
  );
}
