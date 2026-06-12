"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowRight, CheckCircle2, Copy, RefreshCcw, Users, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductPurchaseControls } from "@/components/products/product-purchase-controls";
import { getProductCreditCost } from "@/lib/product-prices";

// B385 scenario A — «Взгляд со стороны». Runs on the ClarityCircle engine:
// the initiator describes a private situation, the platform generates neutral
// questions, and an invited person answers by link without an account.

type FullCircle = {
  id: string;
  question: string;
  status: string;
  inviteToken: string;
  inviteExpiresAt: string;
  teaserText: string | null;
  reportId: string | null;
  participants: { id: string; displayName: string | null; riskFlags: string[] }[];
  metadata?: { outsideQuestions?: string[] } | null;
};

type InviteView = {
  id: string;
  status: string;
  question: string;
  mode: "outside" | "circle";
  outsideQuestions: string[];
  inviteExpiresAt: string;
  participantCount: number;
  full: boolean;
};

type ApiPayload = {
  hasEntitlement?: boolean;
  result?: FullCircle | InviteView;
  results?: FullCircle[];
  teaserText?: string;
  paywalled?: boolean;
  error?: string;
};

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error((payload as ApiPayload).error ?? "Не удалось выполнить действие");
    (error as Error & { status?: number; payload?: unknown }).status = response.status;
    (error as Error & { status?: number; payload?: unknown }).payload = payload;
    throw error;
  }
  return payload as T;
}

export function TogetherActions({ inviteToken }: { inviteToken?: string | null }) {
  const { status: authStatus } = useSession();
  const [circle, setCircle] = useState<FullCircle | null>(null);
  const [invite, setInvite] = useState<InviteView | null>(null);
  const [hasEntitlement, setHasEntitlement] = useState(false);
  const [situation, setSituation] = useState("");
  const [answerText, setAnswerText] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const isAuthenticated = authStatus === "authenticated";

  useEffect(() => {
    if (!inviteToken && authStatus !== "authenticated") return;
    let cancelled = false;
    if (inviteToken) {
      jsonRequest<ApiPayload>(`/api/products/circle/invite/${encodeURIComponent(inviteToken)}`)
        .then((payload) => {
          if (!cancelled) setInvite((payload.result as InviteView) ?? null);
        })
        .catch(() => undefined);
    } else {
      jsonRequest<ApiPayload>("/api/products/circle")
        .then((payload) => {
          if (cancelled) return;
          setHasEntitlement(Boolean(payload.hasEntitlement));
          const outside = (payload.results ?? []).find(
            (item) => (item.metadata?.outsideQuestions?.length ?? 0) > 0,
          );
          setCircle(outside ?? null);
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [authStatus, inviteToken]);

  async function createOutside() {
    if (!isAuthenticated) {
      setMessage("Войдите, чтобы создать ссылку и получить разбор через баллы или карту.");
      setStatus("error");
      return;
    }
    setStatus("loading");
    setMessage(null);
    try {
      const payload = await jsonRequest<ApiPayload>("/api/products/circle", {
        method: "POST",
        body: JSON.stringify({ action: "create_outside", situation, topic: "outside" }),
      });
      setHasEntitlement(Boolean(payload.hasEntitlement));
      setCircle((payload.result as FullCircle) ?? null);
      setSituation("");
      setStatus("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось создать ссылку");
      setStatus("error");
    }
  }

  async function submitAnswer() {
    if (!invite?.id) return;
    setStatus("loading");
    setMessage(null);
    try {
      await jsonRequest<ApiPayload>(`/api/products/circle/${invite.id}/participant`, {
        method: "POST",
        body: JSON.stringify({ answerText, displayName: displayName || undefined, consent: true }),
      });
      setSubmitted(true);
      setAnswerText("");
      setStatus("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось отправить ответ");
      setStatus("error");
    }
  }

  async function generateReport() {
    if (!circle?.id) return;
    setStatus("loading");
    setMessage(null);
    try {
      const payload = await jsonRequest<ApiPayload>(`/api/products/circle/${circle.id}/generate`, {
        method: "POST",
        body: JSON.stringify({ creatorConsent: true }),
      });
      setHasEntitlement(Boolean(payload.hasEntitlement));
      setCircle((payload.result as FullCircle) ?? circle);
      if (payload.paywalled) {
        setMessage(payload.teaserText ?? "Бесплатный фрагмент готов. Полный разбор откроется после оплаты.");
      }
      setStatus("idle");
    } catch (error) {
      const typed = error as Error & { status?: number; payload?: ApiPayload };
      if (typed.status === 402) {
        setMessage(typed.payload?.teaserText ?? typed.message);
        setStatus("error");
        return;
      }
      setMessage(typed.message || "Не удалось собрать разбор");
      setStatus("error");
    }
  }

  function copyInviteLink() {
    if (!circle?.inviteToken) return;
    const url = `${window.location.origin}/products/pair?invite=${circle.inviteToken}&via=outside`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // ── Invited guest view (account-less) ───────────────────────────────
  if (inviteToken) {
    if (submitted) {
      return (
        <div className="soft-card soft-form-panel" data-testid="together-guest-done">
          <p className="soft-eyebrow">спасибо</p>
          <h2 className="soft-h3 mt-2">Ваш взгляд отправлен</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Человек, который вас позвал, увидит бережный разбор. Ваш текст останется приватным —
            он не передаётся как инструмент давления.
          </p>
          <Link href="/products/pair" className="soft-button soft-button-ghost mt-5 w-fit">
            Попробовать «Вместе» самому
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      );
    }
    if (!invite) {
      return (
        <div className="soft-card soft-form-panel" data-testid="together-guest-loading">
          <p className="text-sm text-[var(--soft-ink-soft)]">Загружаем приглашение…</p>
        </div>
      );
    }
    return (
      <div className="soft-card soft-form-panel" data-testid="together-guest">
        <p className="soft-eyebrow">приглашение</p>
        <h2 className="soft-h3 mt-2">Вас попросили о взгляде со стороны</h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
          Ответьте своими словами на эти вопросы — это займёт 2–3 минуты. Регистрация не нужна.
          Вы не видите приватных деталей ситуации, только сами вопросы.
        </p>
        {invite.outsideQuestions.length > 0 && (
          <ul className="mt-5 space-y-2" data-testid="together-questions">
            {invite.outsideQuestions.map((q, index) => (
              <li
                key={index}
                className="rounded-[var(--soft-radius-lg)] bg-[var(--soft-paper-deep)] px-4 py-3 text-sm text-[var(--soft-ink-soft)]"
              >
                {index + 1}. {q}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-5 grid gap-3">
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Как вас подписать (необязательно)"
            className="soft-question-input py-3 text-sm"
          />
          <textarea
            value={answerText}
            onChange={(event) => setAnswerText(event.target.value)}
            placeholder="Что вы видите в этой ситуации?"
            className="soft-question-input min-h-32 py-3 text-sm"
          />
          <Button
            onClick={submitAnswer}
            disabled={status === "loading" || answerText.trim().length < 10}
            className="soft-button soft-button-primary w-fit"
          >
            Отправить взгляд
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
        {message && <p className="mt-4 text-sm text-[var(--soft-bordeaux)]">{message}</p>}
      </div>
    );
  }

  // ── Initiator view ──────────────────────────────────────────────────
  const generatedQuestions = circle?.metadata?.outsideQuestions ?? [];
  const answersCount = circle?.participants.length ?? 0;

  return (
    <div className="soft-card soft-form-panel" data-testid="together-actions">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="soft-eyebrow">взгляд со стороны</p>
          <h2 className="soft-h3 mt-2">Опишите ситуацию</h2>
        </div>
        <span className={hasEntitlement ? "soft-badge soft-badge-warm" : "soft-badge"}>
          {hasEntitlement ? "полный разбор открыт" : "начало бесплатно"}
        </span>
      </div>

      {!circle && (
        <div className="mt-5 grid gap-3">
          <div className="flex gap-2 rounded-[var(--soft-radius-md)] bg-[var(--soft-paper-deep)] p-4 text-sm text-[var(--soft-ink-soft)]">
            <LockKeyhole className="mt-0.5 size-4 shrink-0 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
            <span>Ваш текст увидит только система. Приглашённый получит нейтральные вопросы, а не ваши детали.</span>
          </div>
          <textarea
            value={situation}
            onChange={(event) => setSituation(event.target.value)}
            placeholder="Что происходит и что хочется прояснить чужим, свежим взглядом?"
            className="soft-question-input min-h-28 py-3 text-sm"
            data-testid="together-situation-input"
          />
          <Button
            onClick={createOutside}
            disabled={status === "loading" || situation.trim().length < 10}
            className="soft-button soft-button-primary w-fit"
          >
            Собрать вопросы и ссылку
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      )}

      {circle && (
        <div className="mt-5 space-y-5">
          {generatedQuestions.length > 0 && (
            <div className="rounded-[var(--soft-radius-lg)] bg-[var(--soft-paper-deep)] p-4">
              <p className="text-xs uppercase tracking-wide text-[var(--soft-ink-faint)]">вопросы для приглашённого</p>
              <ul className="mt-2 space-y-1 text-sm text-[var(--soft-ink-soft)]">
                {generatedQuestions.map((q, index) => (
                  <li key={index}>{index + 1}. {q}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex items-center gap-2 text-xs text-[var(--soft-ink-faint)]">
            <Users className="size-4" aria-hidden="true" />
            {answersCount}/5 ответов
            <span>до {new Date(circle.inviteExpiresAt).toLocaleDateString("ru-RU")}</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={`${typeof window !== "undefined" ? window.location.origin : ""}/products/pair?invite=${circle.inviteToken}`}
              className="soft-question-input flex-1 py-2 text-sm"
              data-testid="together-invite-link"
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
            <Button
              onClick={generateReport}
              disabled={status === "loading" || answersCount < 1}
              className="soft-button soft-button-primary"
            >
              {hasEntitlement ? "Собрать полный разбор" : "Показать бесплатный фрагмент"}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
            <Button onClick={() => window.location.reload()} className="soft-button soft-button-ghost">
              <RefreshCcw className="size-4" /> Обновить
            </Button>
            {circle.reportId && (
              <Link href="/cabinet/diary" className="soft-button soft-button-ghost">
                В Дневник
              </Link>
            )}
          </div>
          {!hasEntitlement && (
            <ProductPurchaseControls
              productKey="circle"
              label="Открыть полный разбор"
              checkoutSource="together-generate"
              creditCost={getProductCreditCost("circle") ?? 3}
              onUnlocked={() => {
                setHasEntitlement(true);
                setMessage("Доступ открыт. Теперь можно собрать разбор.");
              }}
            />
          )}
        </div>
      )}

      {message && <p className="mt-4 text-sm text-[var(--soft-bordeaux)]">{message}</p>}
    </div>
  );
}
