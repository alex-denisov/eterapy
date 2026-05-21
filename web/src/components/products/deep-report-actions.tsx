"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowRight, Download, FileText, LockKeyhole, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductPurchaseControls } from "@/components/products/product-purchase-controls";

type DeepReportResult = {
  id: string;
  status: string;
  title: string;
  previewText: string | null;
  resultText: string | null;
  saved: boolean;
};

type ApiPayload = {
  hasEntitlement?: boolean;
  result?: DeepReportResult;
  results?: DeepReportResult[];
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

export function DeepReportActions({ dialogueId }: { dialogueId?: string | null }) {
  const { status: authStatus } = useSession();
  const [result, setResult] = useState<DeepReportResult | null>(null);
  const [hasEntitlement, setHasEntitlement] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "paying" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const isAuthenticated = authStatus === "authenticated";

  useEffect(() => {
    if (!dialogueId || authStatus !== "authenticated") return;
    let cancelled = false;
    jsonRequest<ApiPayload>(`/api/products/deep-report?dialogueId=${encodeURIComponent(dialogueId)}`)
      .then((payload) => {
        if (cancelled) return;
        setHasEntitlement(Boolean(payload.hasEntitlement));
        setResult(payload.results?.[0] ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [authStatus, dialogueId]);

  async function createPreview() {
    if (!dialogueId) return;
    if (!isAuthenticated) {
      setMessage("Войдите, чтобы создать предпросмотр и сохранить отчет в личном кабинете.");
      setStatus("error");
      return;
    }
    setStatus("loading");
    setMessage(null);
    try {
      const payload = await jsonRequest<ApiPayload>("/api/products/deep-report", {
        method: "POST",
        body: JSON.stringify({ dialogueId, action: "preview" }),
      });
      setHasEntitlement(Boolean(payload.hasEntitlement));
      setResult(payload.result ?? null);
      setStatus("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось создать предпросмотр");
      setStatus("error");
    }
  }

  async function generateReport() {
    if (!dialogueId) return;
    if (!isAuthenticated) {
      setMessage("Войдите, чтобы открыть глубокий отчет с баланса, кредитами ясности или картой.");
      setStatus("error");
      return;
    }
    setStatus("loading");
    setMessage(null);
    try {
      const payload = await jsonRequest<ApiPayload>("/api/products/deep-report", {
        method: "POST",
        body: JSON.stringify({ dialogueId, action: "generate" }),
      });
      setHasEntitlement(Boolean(payload.hasEntitlement));
      setResult(payload.result ?? null);
      setStatus("idle");
    } catch (error) {
      const typed = error as Error & { status?: number; payload?: ApiPayload };
      if (typed.status === 402) {
        setMessage("Откройте доступ к глубокому отчету с баланса, кредитами ясности или картой — после этого полный текст появится на этой странице.");
        setStatus("error");
        return;
      }
      setMessage(typed.message || "Не удалось создать отчет");
      setStatus("error");
    }
  }

  async function saveReport() {
    if (!result) return;
    setStatus("loading");
    try {
      const payload = await jsonRequest<ApiPayload>(`/api/products/deep-report/${result.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "save" }),
      });
      setResult(payload.result ?? result);
      setStatus("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить отчет");
      setStatus("error");
    }
  }

  async function deleteReport() {
    if (!result) return;
    setStatus("loading");
    try {
      await jsonRequest(`/api/products/deep-report/${result.id}`, { method: "DELETE" });
      setResult(null);
      setStatus("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось удалить отчет");
      setStatus("error");
    }
  }

  if (!dialogueId) {
    return (
      <div className="soft-card soft-form-panel mt-8" data-testid="deep-report-no-dialogue">
        <FileText className="size-5 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
        <h2 className="soft-h3 mt-3">Отчет строится от вашего первичного ответа</h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
          Сначала пройдите диалог ясности, чтобы отчет не был абстрактным и не терял контекст.
        </p>
        <Link href="/checkin?nextProduct=deep-report" className="soft-button soft-button-primary mt-5">
          Начать с вопроса
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    );
  }

  return (
    <div className="soft-card soft-form-panel mt-8" data-testid="deep-report-actions">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="soft-eyebrow">ваш отчет</p>
          <h2 className="soft-h3 mt-2">Предпросмотр, оплата и полный результат</h2>
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

      {result?.previewText ? (
        <div className="soft-card-flat mt-5 whitespace-pre-wrap p-4 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
          {result.previewText}
        </div>
      ) : (
        <Button onClick={createPreview} disabled={status === "loading"} className="soft-button soft-button-ghost mt-5">
          Создать предпросмотр
        </Button>
      )}

      {result?.resultText && (
        <article className="soft-card mt-5 whitespace-pre-wrap p-5 font-heading text-[1.08rem] leading-relaxed text-[var(--soft-ink)]">
          {result.resultText}
        </article>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        <Button onClick={generateReport} disabled={!hasEntitlement || status === "loading" || status === "paying"} className="soft-button soft-button-primary">
          <LockKeyhole className="size-4" aria-hidden="true" />
          {result?.resultText ? "Обновить отчет" : "Получить полный отчет"}
        </Button>
        {!hasEntitlement && (
          <ProductPurchaseControls
            productKey="deep-report"
            label="Открыть с баланса"
            checkoutSource="deep-report-generate"
            creditCost={4}
            onUnlocked={() => {
              setHasEntitlement(true);
              setMessage("Доступ открыт. Теперь можно получить полный отчет.");
            }}
          />
        )}
        {result?.resultText && (
          <>
            <Button onClick={saveReport} disabled={status === "loading" || result.saved} className="soft-button soft-button-ghost">
              <Save className="size-4" aria-hidden="true" />
              {result.saved ? "Сохранено" : "Сохранить в Мою карту"}
            </Button>
            <a href={`/api/products/deep-report/${result.id}/export`} className="soft-button soft-button-ghost">
              <Download className="size-4" aria-hidden="true" />
              Экспорт
            </a>
            <Button onClick={deleteReport} disabled={status === "loading"} className="soft-button soft-button-ghost">
              <Trash2 className="size-4" aria-hidden="true" />
              Удалить
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
