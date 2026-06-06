"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Download, LockKeyhole, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductIntake } from "@/components/products/product-intake";
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

const TOC_LABELS = [
  "Что я слышу в вашем вопросе",
  "Главная развилка",
  "Карта факт-чувство-предположение",
  "Четыре ракурса · разум · чувства · символ · действие",
  "Возможные сценарии и их цена",
  "Безопасный маршрут на 2 недели",
  "С кем продолжить — если захочется",
];

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
    return () => { cancelled = true; };
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
      setMessage("Войдите, чтобы открыть глубокий отчет кредитами ясности или картой.");
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
        setMessage("Откройте доступ к глубокому отчету кредитами ясности или картой — после этого полный текст появится на этой странице.");
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
      <ProductIntake
        productKey="deep-report"
        mode="full"
        title="Сначала соберём контекст для отчёта"
        description="Отчёт строится прямо здесь: короткий intake сохранит вопрос и уточнения, а затем откроет генерацию документа на этой же странице."
        submitLabel="Начать отчёт"
        readyLabel="Контекст готов. Возвращаем вас к отчёту."
        testId="deep-report-no-dialogue"
      />
    );
  }

  return (
    <div className="soft-card soft-form-panel mt-8" data-testid="deep-report-actions">
      {message && (
        <p className="mb-5 rounded-2xl bg-[var(--soft-paper-deep)] p-3 text-sm text-[var(--soft-bordeaux)]">
          {message}
        </p>
      )}

      {/* Two-column layout: sticky TOC + content */}
      {result?.resultText ? (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          {/* TOC sidebar */}
          <div className="soft-card-flat rounded-[16px] p-5 lg:sticky lg:top-[84px] lg:self-start">
            <p className="soft-eyebrow mb-3">оглавление</p>
            <div className="flex flex-col">
              {TOC_LABELS.map((t, i) => (
                <div
                  key={i}
                  className="flex gap-3 py-2.5"
                  style={{ borderTop: i ? "1px solid var(--soft-paper-edge)" : "none" }}
                >
                  <span
                    className="w-6 shrink-0 font-heading text-sm italic"
                    style={{ color: "var(--soft-terracotta-dark)" }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-sm text-[var(--soft-ink)]">{t}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 flex gap-2">
              <a href={`/api/products/deep-report/${result.id}/export`} className="soft-button soft-button-ghost flex-1 justify-center text-xs">
                PDF
              </a>
              <Button onClick={saveReport} disabled={status === "loading" || result.saved} className="soft-button soft-button-ghost flex-1 justify-center text-xs">
                {result.saved ? "Сохранено" : "Карта"}
              </Button>
            </div>
          </div>

          {/* Report content */}
          <div>
            <article
              className="soft-card rounded-[16px] p-6 font-heading text-[1.05rem] leading-relaxed text-[var(--soft-ink)] whitespace-pre-wrap"
              style={{ background: "linear-gradient(160deg, #FFFCF5, #F4D9C1 200%)" }}
            >
              <p className="soft-eyebrow mb-2">{result.title}</p>
              {result.resultText}
            </article>

            {/* Actions row */}
            <div className="mt-4 flex flex-wrap gap-3">
              <Button onClick={() => void generateReport()} disabled={status === "loading"} className="soft-button soft-button-ghost">
                Обновить отчет
              </Button>
              <a href={`/api/products/deep-report/${result.id}/export`} className="soft-button soft-button-ghost">
                <Download className="size-4" aria-hidden="true" />
                Экспорт
              </a>
              <Button onClick={saveReport} disabled={status === "loading" || result.saved} className="soft-button soft-button-ghost">
                <Save className="size-4" aria-hidden="true" />
                {result.saved ? "Сохранено" : "Сохранить в Мою карту"}
              </Button>
              <Button onClick={deleteReport} disabled={status === "loading"} className="soft-button soft-button-ghost">
                <Trash2 className="size-4" aria-hidden="true" />
                Удалить
              </Button>
            </div>
          </div>
        </div>
      ) : (
        /* Not yet generated — preview + CTA */
        <div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="soft-eyebrow">углубление · документ-разбор</p>
              <h2 className="soft-h3 mt-2">Глубокий отчёт</h2>
            </div>
            <span className={hasEntitlement ? "soft-badge soft-badge-warm" : "soft-badge"}>
              {hasEntitlement ? "доступ открыт" : "нужна оплата"}
            </span>
          </div>

          {/* TOC preview */}
          <div
            className="mt-5 rounded-[16px] p-5"
            style={{ background: "linear-gradient(160deg, #FFFCF5, #F4D9C1)" }}
          >
            <p className="soft-eyebrow mb-3">оглавление</p>
            <div className="flex flex-col">
              {TOC_LABELS.map((t, i) => (
                <div
                  key={i}
                  className="flex gap-3 py-2"
                  style={{ borderTop: i ? "1px solid var(--soft-paper-edge)" : "none", opacity: i > 1 ? 0.5 : 1 }}
                >
                  <span className="w-6 shrink-0 font-heading text-sm italic" style={{ color: "var(--soft-terracotta-dark)" }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-sm text-[var(--soft-ink)]">{t}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Preview text if available */}
          {result?.previewText && (
            <div className="mt-4 rounded-[16px] bg-[var(--soft-paper-deep)] p-4 text-sm leading-relaxed text-[var(--soft-ink-soft)] whitespace-pre-wrap">
              {result.previewText}
            </div>
          )}

          {/* CTAs */}
          <div className="mt-5 flex flex-wrap gap-3">
            {!result?.previewText && (
              <Button onClick={createPreview} disabled={status === "loading"} className="soft-button soft-button-ghost">
                Создать предпросмотр
              </Button>
            )}
            <Button
              onClick={() => void generateReport()}
              disabled={!hasEntitlement || status === "loading" || status === "paying"}
              className="soft-button soft-button-primary"
            >
              <LockKeyhole className="size-4" aria-hidden="true" />
              {result?.previewText ? "Получить полный отчет" : "Сформировать отчёт"}
            </Button>
            {!hasEntitlement && (
              <ProductPurchaseControls
                productKey="deep-report"
                label="Открыть полный отчет"
                checkoutSource="deep-report-generate"
                creditCost={4}
                onUnlocked={() => { setHasEntitlement(true); void generateReport(); }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
