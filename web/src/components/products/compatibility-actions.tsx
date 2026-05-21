"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowRight, Copy, CheckCircle2, Flag, RefreshCcw, LockKeyhole, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductPurchaseControls } from "@/components/products/product-purchase-controls";

type CompatibilityResult = {
  id: string;
  status: string; // CREATED | INVITED | PARTNER_COMPLETED | READY | DELETED
  type: string;
  inviteToken: string;
  creatorConsent: boolean;
  partnerConsent: boolean;
  creatorId: string;
  partnerId: string | null;
  reportId: string | null;
};

type ApiPayload = {
  hasEntitlement?: boolean;
  result?: CompatibilityResult;
  results?: CompatibilityResult[];
  checkout?: { productKey: string; checkoutSource: string };
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

export function CompatibilityActions({
  dialogueId,
  inviteToken,
}: {
  dialogueId?: string | null;
  inviteToken?: string | null;
}) {
  const { status: authStatus } = useSession();
  const [result, setResult] = useState<CompatibilityResult | null>(null);
  const [hasEntitlement, setHasEntitlement] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "paying" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const isAuthenticated = authStatus === "authenticated";
  
  // Partner's part
  const partnerDialogueId = dialogueId ?? null;

  useEffect(() => {
    if (!inviteToken && authStatus !== "authenticated") return;
    let cancelled = false;
    const url = inviteToken 
      ? `/api/products/compatibility/invite/${encodeURIComponent(inviteToken)}`
      : dialogueId 
        ? `/api/products/compatibility?dialogueId=${encodeURIComponent(dialogueId)}`
        : `/api/products/compatibility`;
        
    jsonRequest<ApiPayload>(url)
      .then((payload) => {
        if (cancelled) return;
        setHasEntitlement(Boolean(payload.hasEntitlement));
        setResult(payload.results?.[0] ?? payload.result ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [authStatus, dialogueId, inviteToken]);

  async function createInvite() {
    if (!dialogueId) return;
    if (!isAuthenticated) {
      setMessage("Войдите, чтобы создать приглашение и открыть совместимость через баланс, кредиты или карту.");
      setStatus("error");
      return;
    }
    setStatus("loading");
    setMessage(null);
    try {
      const payload = await jsonRequest<ApiPayload>("/api/products/compatibility", {
        method: "POST",
        body: JSON.stringify({ dialogueId, type: "romantic", action: "create_invite" }),
      });
      setHasEntitlement(Boolean(payload.hasEntitlement));
      setResult(payload.result ?? null);
      setStatus("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось создать приглашение");
      setStatus("error");
    }
  }

  async function submitPartnerPart() {
    if (!result?.id || !partnerDialogueId) return;
    setStatus("loading");
    setMessage(null);
    try {
      const payload = await jsonRequest<ApiPayload>(`/api/products/compatibility/${result.id}/partner-part`, {
        method: "POST",
        body: JSON.stringify({ dialogueId: partnerDialogueId, partnerConsent: true }),
      });
      setHasEntitlement(Boolean(payload.hasEntitlement));
      setResult(payload.result ?? null);
      setStatus("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось отправить вашу часть");
      setStatus("error");
    }
  }

  async function declineInvite(report = false) {
    if (!result?.id) return;
    setStatus("loading");
    setMessage(null);
    try {
      const payload = await jsonRequest<ApiPayload>(`/api/products/compatibility/${result.id}/decline`, {
        method: "POST",
        body: JSON.stringify({
          report,
          reason: report ? "Приглашение кажется небезопасным или нежелательным" : "Партнер отказался от участия",
        }),
      });
      setResult(payload.result ?? null);
      setMessage(report ? "Приглашение отправлено на проверку." : "Приглашение отклонено.");
      setStatus("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось обновить приглашение");
      setStatus("error");
    }
  }

  async function generateReport() {
    if (!result?.id) return;
    setStatus("loading");
    setMessage(null);
    try {
      const payload = await jsonRequest<ApiPayload>(`/api/products/compatibility/${result.id}/generate`, {
        method: "POST",
        body: JSON.stringify({ creatorConsent: true }),
      });
      setHasEntitlement(Boolean(payload.hasEntitlement));
      setResult(payload.result ?? null);
      setStatus("idle");
    } catch (error) {
      const typed = error as Error & { status?: number; payload?: ApiPayload };
      if (typed.status === 402) {
        setMessage("Откройте доступ к совместимости с баланса, кредитами ясности или картой — ответы партнеров останутся на месте.");
        setStatus("error");
        return;
      }
      setMessage(typed.message || "Не удалось получить разбор");
      setStatus("error");
    }
  }

  function copyInviteLink() {
    if (!result?.inviteToken) return;
    const url = `${window.location.origin}/pair?invite=${result.inviteToken}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (inviteToken && result && result.status === "INVITED") {
    return (
      <div className="soft-card soft-form-panel mt-8" data-testid="compatibility-actions-partner">
        <h2 className="soft-h3">Вас пригласили на разбор совместимости</h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
          Ваш партнер ответил на свои вопросы. Теперь ваша очередь. Ваши ответы будут скрыты от партнера, а партнерские — от вас. Вы оба увидите только итоговый отчет.
        </p>
        
        {message && (
          <p className="mt-4 rounded-2xl bg-[var(--soft-paper-deep)] p-3 text-sm text-[var(--soft-bordeaux)]">
            {message}
          </p>
        )}

        {!partnerDialogueId ? (
          <Link href={`/checkin?nextProduct=compatibility&invite=${inviteToken}`} className="soft-button soft-button-primary mt-5">
            Ответить на свою часть
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        ) : (
          <div className="mt-5 flex flex-wrap gap-3">
            <Button onClick={submitPartnerPart} disabled={status === "loading"} className="soft-button soft-button-primary">
              Отправить свои ответы и дать согласие
              <CheckCircle2 className="size-4" aria-hidden="true" />
            </Button>
            <Button onClick={() => declineInvite(false)} disabled={status === "loading"} className="soft-button soft-button-ghost" data-testid="pair-decline-invite">
              <XCircle className="size-4" aria-hidden="true" />
              Отклонить
            </Button>
            <Button onClick={() => declineInvite(true)} disabled={status === "loading"} className="soft-button soft-button-ghost" data-testid="pair-report-invite">
              <Flag className="size-4" aria-hidden="true" />
              Пожаловаться
            </Button>
          </div>
        )}
      </div>
    );
  }

  if (!dialogueId && !result) {
    return (
      <div className="soft-card soft-form-panel mt-8" data-testid="compatibility-no-dialogue">
        <h2 className="soft-h3 mt-3">Разбор строится на ответах обоих партнеров</h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
          Сначала ответьте на вопросы со своей стороны, а затем отправьте ссылку партнеру.
        </p>
        <Link href="/checkin?nextProduct=compatibility" className="soft-button soft-button-primary mt-5">
          Начать со своей стороны
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    );
  }

  return (
    <div className="soft-card soft-form-panel mt-8" data-testid="compatibility-actions">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="soft-eyebrow">совместимость</p>
          <h2 className="soft-h3 mt-2">Синхронизация ответов</h2>
        </div>
        <span className={hasEntitlement ? "soft-badge soft-badge-warm" : "soft-badge"}>
          {hasEntitlement ? "доступ открыт" : "нужна оплата"}
        </span>
      </div>

      {message && (
        <p className="mt-4 rounded-2xl bg-[var(--soft-paper-deep)] p-3 text-sm text-[var(--soft-bordeaux)]">
          {message}
        </p>
      )}

      {!result && (
        <div className="mt-5">
          <p className="text-sm text-[var(--soft-ink-soft)]">Ваша часть готова. Создайте ссылку-приглашение для партнера.</p>
          <Button onClick={createInvite} disabled={status === "loading"} className="soft-button soft-button-primary mt-4">
            Создать ссылку
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      )}

      {result && result.status === "INVITED" && (
        <div className="mt-5">
          <p className="text-sm text-[var(--soft-ink-soft)] mb-2">Отправьте эту ссылку партнеру. Как только он ответит, статус обновится.</p>
          <div className="flex items-center gap-2">
            <input 
              readOnly 
              value={`${typeof window !== 'undefined' ? window.location.origin : ''}/pair?invite=${result.inviteToken}`}
              className="soft-question-input flex-1 py-2 text-sm" 
            />
            <Button onClick={copyInviteLink} className="soft-button soft-button-ghost shrink-0">
              {copied ? <CheckCircle2 className="size-4" /> : <Copy className="size-4" />}
            </Button>
          </div>
          <Button onClick={() => window.location.reload()} className="soft-button soft-button-ghost mt-4">
            <RefreshCcw className="size-4" /> Обновить статус
          </Button>
        </div>
      )}

      {result && result.status === "PARTNER_COMPLETED" && (
        <div className="mt-5">
          <p className="text-sm text-[var(--soft-ink-soft)] mb-4">Партнер заполнил свою часть и дал согласие. Теперь вы можете получить разбор.</p>
          <Button onClick={generateReport} disabled={!hasEntitlement || status === "loading" || status === "paying"} className="soft-button soft-button-primary">
            <LockKeyhole className="size-4" aria-hidden="true" />
            Получить разбор (требуется согласие)
          </Button>
          {!hasEntitlement && (
            <ProductPurchaseControls
              productKey="compatibility"
              label="Открыть с баланса"
              checkoutSource="compatibility-generate"
              creditCost={4}
              onUnlocked={() => {
                setHasEntitlement(true);
                generateReport();
              }}
            />
          )}
        </div>
      )}

      {result && (result.status === "DECLINED" || result.status === "REVIEW") && (
        <div className="mt-5 rounded-[var(--soft-radius-lg)] bg-[var(--soft-paper-deep)] p-4 text-sm text-[var(--soft-bordeaux)]">
          {result.status === "REVIEW"
            ? "Приглашение остановлено и отправлено на проверку."
            : "Партнер отклонил приглашение. Можно вернуться к своему разбору без совместного отчета."}
        </div>
      )}

      {result && result.status === "READY" && (
        <div className="mt-5">
          <p className="text-sm text-green-700">Разбор готов и доступен обоим партнерам в личном кабинете.</p>
          <Link href="/cabinet/action-history" className="soft-button soft-button-primary mt-4">
            Посмотреть разбор
          </Link>
        </div>
      )}
    </div>
  );
}
