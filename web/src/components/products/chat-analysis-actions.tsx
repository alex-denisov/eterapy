"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Download, LockKeyhole, Save, Trash2, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";

type ChatAnalysisResult = {
  id: string;
  status: string;
  title: string;
  previewText: string | null;
  resultText: string | null;
  saved: boolean;
  metadata?: {
    sourceText?: string | null;
    sourceDeletedAt?: string | null;
  };
};

type ApiPayload = {
  hasEntitlement?: boolean;
  result?: ChatAnalysisResult;
  results?: ChatAnalysisResult[];
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

export function ChatAnalysisActions() {
  const [result, setResult] = useState<ChatAnalysisResult | null>(null);
  const [hasEntitlement, setHasEntitlement] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "paying" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [sourceText, setSourceText] = useState("");

  useEffect(() => {
    let cancelled = false;
    jsonRequest<ApiPayload>("/api/products/chat-analysis")
      .then((payload) => {
        if (cancelled) return;
        setHasEntitlement(Boolean(payload.hasEntitlement));
        setResult(payload.results?.[0] ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function createPreview() {
    if (!sourceText.trim()) return;
    setStatus("loading");
    setMessage(null);
    try {
      const payload = await jsonRequest<ApiPayload>("/api/products/chat-analysis", {
        method: "POST",
        body: JSON.stringify({ sourceText: sourceText.trim(), action: "upload_preview" }),
      });
      setHasEntitlement(Boolean(payload.hasEntitlement));
      setResult(payload.result ?? null);
      setSourceText(""); // clear input after upload
      setStatus("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось загрузить переписку");
      setStatus("error");
    }
  }

  async function generateReport() {
    if (!result?.id) return;
    setStatus("loading");
    setMessage(null);
    try {
      const payload = await jsonRequest<ApiPayload>("/api/products/chat-analysis", {
        method: "POST",
        body: JSON.stringify({ id: result.id, action: "generate" }),
      });
      setHasEntitlement(Boolean(payload.hasEntitlement));
      setResult(payload.result ?? null);
      setStatus("idle");
    } catch (error) {
      const typed = error as Error & { status?: number; payload?: ApiPayload };
      if (typed.status === 402) {
        setStatus("paying");
        const payment = await jsonRequest<{ confirmationUrl?: string }>("/api/billing/create-payment", {
          method: "POST",
          body: JSON.stringify({
            productKey: "chat-analysis",
            checkoutSource: "chat-analysis-generate",
          }),
        });
        if (payment.confirmationUrl) {
          window.location.href = payment.confirmationUrl;
          return;
        }
      }
      setMessage(typed.message || "Не удалось получить разбор");
      setStatus("error");
    }
  }

  async function saveReport() {
    if (!result) return;
    setStatus("loading");
    try {
      const payload = await jsonRequest<ApiPayload>(`/api/products/chat-analysis/${result.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "save" }),
      });
      setResult(payload.result ?? result);
      setStatus("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить результат");
      setStatus("error");
    }
  }

  async function deleteSource() {
    if (!result) return;
    setStatus("loading");
    try {
      const payload = await jsonRequest<ApiPayload>(`/api/products/chat-analysis/${result.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "delete_source" }),
      });
      setResult(payload.result ?? result);
      setStatus("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось удалить исходник");
      setStatus("error");
    }
  }

  async function deleteReport() {
    if (!result) return;
    setStatus("loading");
    try {
      await jsonRequest(`/api/products/chat-analysis/${result.id}`, { method: "DELETE" });
      setResult(null);
      setStatus("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось удалить результат");
      setStatus("error");
    }
  }

  return (
    <div className="soft-card soft-form-panel mt-8" data-testid="chat-analysis-actions">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="soft-eyebrow">загрузка</p>
          <h2 className="soft-h3 mt-2">Вставьте текст переписки</h2>
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
        <>
          <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Мы анонимизируем имена на «Я» и «Собеседник» перед разбором. Пожалуйста, удалите телефоны, адреса и другие чувствительные данные перед загрузкой.
          </p>
          <textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            placeholder="— Ты опять не отвечаешь.&#10;— Я был занят..."
            className="soft-question-input mt-4"
            rows={8}
            disabled={status === "loading"}
          />
          <Button
            onClick={createPreview}
            disabled={status === "loading" || sourceText.trim().length < 10}
            className="soft-button soft-button-primary mt-5"
          >
            Предпросмотр разбора
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </>
      )}

      {result?.previewText && !result?.resultText && (
        <>
          <div className="soft-card-flat mt-5 whitespace-pre-wrap p-4 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            <p className="soft-eyebrow mb-2 text-[var(--soft-bordeaux)]">Предпросмотр анонимизации</p>
            {result.previewText}
          </div>
          <Button onClick={generateReport} disabled={status === "loading" || status === "paying"} className="soft-button soft-button-primary mt-5">
            <LockKeyhole className="size-4" aria-hidden="true" />
            {status === "paying" ? "Открываем оплату..." : "Получить полный разбор"}
          </Button>
        </>
      )}

      {result?.resultText && (
        <article className="soft-card mt-5 whitespace-pre-wrap p-5 font-heading text-[1.08rem] leading-relaxed text-[var(--soft-ink)]">
          {result.resultText}
        </article>
      )}

      {result?.resultText && (
        <div className="mt-5 flex flex-wrap gap-3">
          <Button onClick={saveReport} disabled={status === "loading" || result.saved} className="soft-button soft-button-ghost">
            <Save className="size-4" aria-hidden="true" />
            {result.saved ? "Сохранено" : "Сохранить в Мою карту"}
          </Button>
          <a href={`/api/products/chat-analysis/${result.id}/export`} className="soft-button soft-button-ghost">
            <Download className="size-4" aria-hidden="true" />
            Экспорт
          </a>
          {result.metadata?.sourceText && !result.metadata?.sourceDeletedAt && (
            <Button onClick={deleteSource} disabled={status === "loading"} className="soft-button soft-button-ghost text-[var(--soft-terracotta-dark)]">
              <EyeOff className="size-4" aria-hidden="true" />
              Удалить исходник
            </Button>
          )}
          <Button onClick={deleteReport} disabled={status === "loading"} className="soft-button soft-button-ghost">
            <Trash2 className="size-4" aria-hidden="true" />
            Удалить разбор
          </Button>
        </div>
      )}
    </div>
  );
}
