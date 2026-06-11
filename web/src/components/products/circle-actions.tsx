"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowRight, CheckCircle2, Copy, Flag, RefreshCcw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductPurchaseControls } from "@/components/products/product-purchase-controls";

type CircleParticipant = {
  id: string;
  displayName: string | null;
  answerText: string;
  consent: boolean;
  riskFlags: string[];
};

type CircleResult = {
  id: string;
  question: string;
  topic: string | null;
  status: string;
  inviteToken: string;
  inviteExpiresAt: string;
  teaserText: string | null;
  reportId: string | null;
  participants: CircleParticipant[];
};

type ApiPayload = {
  hasEntitlement?: boolean;
  result?: CircleResult;
  results?: CircleResult[];
  teaserText?: string;
  paywalled?: boolean;
  error?: string;
};

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error ?? "Не удалось выполнить действие");
    (error as Error & { status?: number; payload?: unknown }).status = response.status;
    (error as Error & { status?: number; payload?: unknown }).payload = payload;
    throw error;
  }
  return payload as T;
}

export function CircleActions({ inviteToken }: { inviteToken?: string | null }) {
  const { status: authStatus } = useSession();
  const [circle, setCircle] = useState<CircleResult | null>(null);
  const [hasEntitlement, setHasEntitlement] = useState(false);
  const [question, setQuestion] = useState("");
  const [answerText, setAnswerText] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "paying" | "error">("idle");
  const isAuthenticated = authStatus === "authenticated";

  useEffect(() => {
    if (!inviteToken && authStatus !== "authenticated") return;
    let cancelled = false;
    const url = inviteToken
      ? `/api/products/circle/invite/${encodeURIComponent(inviteToken)}`
      : "/api/products/circle";

    jsonRequest<ApiPayload>(url)
      .then((payload) => {
        if (cancelled) return;
        setHasEntitlement(Boolean(payload.hasEntitlement));
        setCircle(payload.result ?? payload.results?.[0] ?? null);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [authStatus, inviteToken]);

  async function createCircle() {
    if (!isAuthenticated) {
      setMessage("Войдите, чтобы создать круг и управлять доступом через баллы или карту.");
      setStatus("error");
      return;
    }
    setStatus("loading");
    setMessage(null);
    try {
      const payload = await jsonRequest<ApiPayload>("/api/products/circle", {
        method: "POST",
        body: JSON.stringify({ action: "create_circle", question, topic: "relationships" }),
      });
      setHasEntitlement(Boolean(payload.hasEntitlement));
      setCircle(payload.result ?? null);
      setQuestion("");
      setStatus("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось создать круг");
      setStatus("error");
    }
  }

  async function submitAnswer() {
    if (!circle?.id) return;
    setStatus("loading");
    setMessage(null);
    try {
      const payload = await jsonRequest<ApiPayload>(`/api/products/circle/${circle.id}/participant`, {
        method: "POST",
        body: JSON.stringify({ answerText, displayName, consent: true }),
      });
      setCircle(payload.result ?? null);
      setAnswerText("");
      setStatus("idle");
      setMessage("Ответ принят. Автор круга увидит только общий статус и итог.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось отправить ответ");
      setStatus("error");
    }
  }

  async function generateCircle() {
    if (!circle?.id) return;
    setStatus("loading");
    setMessage(null);
    try {
      const payload = await jsonRequest<ApiPayload>(`/api/products/circle/${circle.id}/generate`, {
        method: "POST",
        body: JSON.stringify({ creatorConsent: true }),
      });
      setHasEntitlement(Boolean(payload.hasEntitlement));
      setCircle(payload.result ?? null);
      if (payload.paywalled) {
        setMessage(payload.teaserText ?? "Бесплатный фрагмент готов. Полный итог откроется после оплаты.");
      }
      setStatus("idle");
    } catch (error) {
      const typed = error as Error & { status?: number; payload?: ApiPayload };
      if (typed.status === 402) {
        setCircle(typed.payload?.result ?? circle);
        setMessage(typed.payload?.teaserText ?? typed.message);
        setStatus("error");
        return;
      }
      setMessage(typed.message || "Не удалось собрать итог");
      setStatus("error");
    }
  }

  async function reportParticipant(participantId: string) {
    if (!circle?.id) return;
    setStatus("loading");
    setMessage(null);
    try {
      await jsonRequest(`/api/products/circle/${circle.id}/report`, {
        method: "POST",
        body: JSON.stringify({ participantId, reason: "Ответ нарушает границы круга" }),
      });
      setCircle({
        ...circle,
        participants: circle.participants.filter((participant) => participant.id !== participantId),
      });
      setMessage("Ответ скрыт и отправлен на проверку.");
      setStatus("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось отправить жалобу");
      setStatus("error");
    }
  }

  function copyInviteLink() {
    if (!circle?.inviteToken) return;
    const url = `${window.location.origin}/products/circle?invite=${circle.inviteToken}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (inviteToken && circle) {
    return (
      <div className="soft-card soft-form-panel" data-testid="circle-participant-actions">
        <p className="soft-eyebrow">приглашение в круг</p>
        <h2 className="soft-h3 mt-2">{circle.question}</h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
          Ваш ответ видит система и автор итогового круга только в собранном результате. Это не голосование и не публичная публикация.
        </p>
        <div className="mt-5 grid gap-3">
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Как вас подписать в круге"
            className="soft-question-input py-3 text-sm"
          />
          <textarea
            value={answerText}
            onChange={(event) => setAnswerText(event.target.value)}
            placeholder="Что вы видите в этой ситуации?"
            className="soft-question-input min-h-32 py-3 text-sm"
          />
          <Button onClick={submitAnswer} disabled={status === "loading" || answerText.trim().length < 10} className="soft-button soft-button-primary w-fit">
            Отправить ответ
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
        {message && <p className="mt-4 text-sm text-[var(--soft-bordeaux)]">{message}</p>}
      </div>
    );
  }

  return (
    <div className="soft-card soft-form-panel" data-testid="circle-actions">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="soft-eyebrow">круг</p>
          <h2 className="soft-h3 mt-2">Создайте общий вопрос</h2>
        </div>
        <span className={hasEntitlement ? "soft-badge soft-badge-warm" : "soft-badge"}>
          {hasEntitlement ? "полный итог открыт" : "начало бесплатно"}
        </span>
      </div>

      {!circle && (
        <div className="mt-5 grid gap-3">
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="О чем вы хотите спросить близкий круг?"
            className="soft-question-input min-h-28 py-3 text-sm"
          />
          <Button onClick={createCircle} disabled={status === "loading" || question.trim().length < 10} className="soft-button soft-button-primary w-fit">
            Создать ссылку круга
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      )}

      {circle && (
        <div className="mt-5 space-y-5">
          <div className="rounded-[var(--soft-radius-lg)] bg-[var(--soft-paper-deep)] p-4">
            <p className="text-sm text-[var(--soft-ink-soft)]">{circle.question}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--soft-ink-faint)]">
              <Users className="size-4" aria-hidden="true" />
              {circle.participants.length}/5 ответов
              <span>до {new Date(circle.inviteExpiresAt).toLocaleDateString("ru-RU")}</span>
            </div>
          </div>
          {circle.participants.length > 0 && (
            <div className="space-y-2" data-testid="circle-participant-review-list">
              {circle.participants.map((participant) => (
                <div key={participant.id} className="flex items-center justify-between gap-3 rounded-[var(--soft-radius-lg)] bg-[var(--soft-paper-deep)] px-3 py-2 text-sm">
                  <span className="truncate text-[var(--soft-ink-soft)]">
                    {participant.displayName || "Участник"} · {participant.riskFlags.length ? "нужна внимательность" : "ответ принят"}
                  </span>
                  <Button onClick={() => reportParticipant(participant.id)} className="soft-button soft-button-ghost shrink-0" title="Пожаловаться">
                    <Flag className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={`${typeof window !== "undefined" ? window.location.origin : ""}/products/circle?invite=${circle.inviteToken}`}
              className="soft-question-input flex-1 py-2 text-sm"
            />
            <Button onClick={copyInviteLink} className="soft-button soft-button-ghost shrink-0">
              {copied ? <CheckCircle2 className="size-4" /> : <Copy className="size-4" />}
            </Button>
          </div>
          {circle.teaserText && (
            <p className="rounded-[var(--soft-radius-lg)] bg-[var(--soft-paper-deep)] p-4 text-sm text-[var(--soft-bordeaux)]">
              {circle.teaserText}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button onClick={generateCircle} disabled={status === "loading" || circle.participants.length < 2} className="soft-button soft-button-primary">
              {hasEntitlement ? "Собрать полный итог" : "Показать бесплатный фрагмент"}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
            <Button onClick={() => window.location.reload()} className="soft-button soft-button-ghost">
              <RefreshCcw className="size-4" /> Обновить
            </Button>
            {circle.reportId && (
              <Link href="/cabinet/diary" className="soft-button soft-button-ghost">
                В Мою карту
              </Link>
            )}
          </div>
          {!hasEntitlement && (
            <div className="mt-3">
              <ProductPurchaseControls
                productKey="circle"
                label="Открыть полный итог"
                checkoutSource="circle-generate"
                creditCost={4}
                onUnlocked={() => {
                  setHasEntitlement(true);
                  setMessage("Доступ открыт. Теперь можно собрать итог круга.");
                }}
              />
            </div>
          )}
        </div>
      )}

      {message && <p className="mt-4 text-sm text-[var(--soft-bordeaux)]">{message}</p>}
    </div>
  );
}
