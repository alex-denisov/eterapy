"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { ArrowRight, Download, LockKeyhole, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductPurchaseControls } from "@/components/products/product-purchase-controls";
import { SoftMarkdown } from "@/components/ui/soft-markdown";
import { TarotSpreadCards, ZodiacWheel } from "@/components/products/esoteric-chart-visuals";
import type { NatalWheel } from "@/lib/esoteric-chart";

type SymbolicResult = {
  id: string;
  status: string;
  title: string;
  previewText: string | null;
  resultText: string | null;
  saved: boolean;
  metadata?: unknown;
};

type TarotCardView = { position: string; name: string; meaning: string; reversed: boolean };

// #12: pull the real drawn cards out of the stored generation metadata (the
// route nests it under generationMetadata / previewGenerationMetadata).
function extractTarotCards(result: SymbolicResult | null): TarotCardView[] | null {
  const md = result?.metadata;
  if (!md || typeof md !== "object") return null;
  const meta = md as Record<string, unknown>;
  const nested = (meta.generationMetadata ?? meta.previewGenerationMetadata) as Record<string, unknown> | undefined;
  const raw = (nested?.cards ?? meta.cards) as unknown;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const cards = raw.filter(
    (c): c is TarotCardView => !!c && typeof c === "object" && typeof (c as { name?: unknown }).name === "string",
  );
  return cards.length > 0 ? cards : null;
}

// B388: натальное колесо хранится в metadata так же, как карты Таро.
function extractNatalWheel(result: SymbolicResult | null): NatalWheel | null {
  const md = result?.metadata;
  if (!md || typeof md !== "object") return null;
  const meta = md as Record<string, unknown>;
  const nested = (meta.generationMetadata ?? meta.previewGenerationMetadata) as Record<string, unknown> | undefined;
  const raw = (nested?.wheel ?? meta.wheel) as unknown;
  if (!raw || typeof raw !== "object") return null;
  const wheel = raw as { sunSign?: unknown; placements?: unknown };
  if (!wheel.sunSign || !Array.isArray(wheel.placements)) return null;
  return raw as NatalWheel;
}

type ApiPayload = {
  hasEntitlement?: boolean;
  result?: SymbolicResult;
  results?: SymbolicResult[];
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
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return payload as T;
}

export function SymbolicProductActions({
  productKey,
  title,
  promptLabel,
  placeholder,
  creditCost,
}: {
  productKey: "tarot" | "natal-chart" | "numerology" | "family-scenarios";
  title: string;
  promptLabel: string;
  placeholder: string;
  creditCost: number;
}) {
  const { status: authStatus } = useSession();
  const [hasEntitlement, setHasEntitlement] = useState(false);
  const [result, setResult] = useState<SymbolicResult | null>(null);
  const [userInput, setUserInput] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    let cancelled = false;
    jsonRequest<ApiPayload>(`/api/products/symbolic?productKey=${productKey}`)
      .then((payload) => {
        if (cancelled) return;
        setHasEntitlement(Boolean(payload.hasEntitlement));
        setResult(payload.results?.[0] ?? null);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [authStatus, productKey]);

  async function generateResult() {
    if (authStatus !== "authenticated") {
      setMessage("Войдите, чтобы открыть продукт и сохранить результат в кабинете.");
      setStatus("error");
      return;
    }
    setStatus("loading");
    setMessage(null);
    try {
      const payload = await jsonRequest<ApiPayload>("/api/products/symbolic", {
        method: "POST",
        body: JSON.stringify({ productKey, userInput }),
      });
      setHasEntitlement(Boolean(payload.hasEntitlement));
      setResult(payload.result ?? null);
      if (payload.paywalled) {
        setMessage("Бесплатный фрагмент готов. Полный разбор можно открыть баллами или картой.");
      }
      setStatus("idle");
    } catch (error) {
      const typed = error as Error & { status?: number };
      if (typed.status === 402) {
        setMessage("Откройте доступ баллами или картой — полный результат появится здесь же.");
      } else {
        setMessage(typed.message || "Не удалось создать результат");
      }
      setStatus("error");
    }
  }

  // B308: real save → PATCH /api/products/symbolic/[id] with action: "save".
  // Spec (04_UI_UX_Mechanics §10) requires every symbolic result to be
  // saveable into the user's Мою карту (диалоги/результаты Дневника).
  async function saveToMap() {
    if (!result) return;
    setStatus("loading");
    setMessage(null);
    try {
      const payload = await jsonRequest<ApiPayload>(`/api/products/symbolic/${result.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "save" }),
      });
      setResult(payload.result ?? result);
      setStatus("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить в Мою карту");
      setStatus("error");
    }
  }

  const tarotCards = productKey === "tarot" ? extractTarotCards(result) : null;
  const natalWheel = productKey === "natal-chart" ? extractNatalWheel(result) : null;

  return (
    <div className="soft-card soft-form-panel mt-8" data-testid={`symbolic-product-actions-${productKey}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="soft-eyebrow">получить продукт</p>
          <h2 className="soft-h3 mt-2">{title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Полный разбор открывается баллами или картой — результат появится здесь же. Можно начать с бесплатного фрагмента.
          </p>
        </div>
        <span className={hasEntitlement ? "soft-badge soft-badge-warm" : "soft-badge"}>
          {hasEntitlement ? "доступ открыт" : "фрагмент бесплатно"}
        </span>
      </div>

      {message && (
        <p className="mt-4 rounded-2xl bg-[var(--soft-paper-deep)] p-3 text-sm text-[var(--soft-bordeaux)]">
          {message}
        </p>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)]">
        <div className="soft-card-flat p-5">
          <label className="soft-eyebrow" htmlFor={`symbolic-input-${productKey}`}>{promptLabel}</label>
          <textarea
            id={`symbolic-input-${productKey}`}
            value={userInput}
            onChange={(event) => setUserInput(event.target.value)}
            placeholder={placeholder}
            rows={6}
            className="soft-question-input mt-3"
            disabled={status === "loading"}
          />
          {/* #7: one clear order action. The PAID CTA (credits → full result in
              one click) is primary; the free fragment is a quiet secondary link
              so users no longer mistake the teaser for the order and pay twice. */}
          <div className="mt-4 flex flex-col gap-3">
            {hasEntitlement ? (
              <Button
                type="button"
                onClick={generateResult}
                disabled={status === "loading"}
                className="soft-button soft-button-primary"
              >
                <LockKeyhole className="size-4" aria-hidden="true" />
                {status === "loading" ? "Собираем результат" : "Получить полный результат"}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            ) : (
              <>
                <ProductPurchaseControls
                  productKey={productKey}
                  label={`Открыть ${title}`}
                  checkoutSource={`${productKey}-direct`}
                  creditCost={creditCost}
                  onUnlocked={() => {
                    setHasEntitlement(true);
                    if (userInput.trim()) {
                      void generateResult();
                    } else {
                      setMessage("Доступ открыт. Добавьте данные или вопрос — и получите результат здесь же.");
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={generateResult}
                  disabled={status === "loading"}
                  className="self-start text-sm font-medium text-[var(--soft-bordeaux)] underline underline-offset-4 disabled:opacity-50"
                  data-testid={`symbolic-free-fragment-${productKey}`}
                >
                  {status === "loading" ? "Собираем фрагмент…" : "Сначала бесплатный фрагмент"}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="soft-card p-5">
          <p className="soft-eyebrow">результат</p>
          {tarotCards && <TarotSpreadCards cards={tarotCards} />}
          {natalWheel && <div className="mt-3"><ZodiacWheel wheel={natalWheel} /></div>}
          {result?.resultText ? (
            <>
              <SoftMarkdown
                content={result.resultText}
                className="mt-3 font-heading text-[1.08rem] text-[var(--soft-ink)]"
              />
              <div className="mt-5 flex flex-wrap gap-3">
                <Button
                  type="button"
                  onClick={saveToMap}
                  disabled={result.saved || status === "loading"}
                  className="soft-button soft-button-ghost"
                  data-testid={`symbolic-save-${productKey}`}
                >
                  <Save className="size-4" aria-hidden="true" />
                  {result.saved ? "Сохранено в Мою карту" : status === "loading" ? "Сохраняем…" : "Сохранить в Мою карту"}
                </Button>
                {/* B388: PDF с отрисовкой визуала (колесо/расклад), не только текст. */}
                <a
                  href={`/products/print/${result.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="soft-button soft-button-ghost"
                  data-testid={`symbolic-pdf-${productKey}`}
                >
                  <Download className="size-4" aria-hidden="true" />
                  Скачать PDF
                </a>
              </div>
            </>
          ) : result?.previewText ? (
            <>
              <SoftMarkdown
                content={result.previewText}
                className="mt-3 font-heading text-[1.08rem] text-[var(--soft-ink)]"
              />
              <p className="mt-4 rounded-[16px] bg-[var(--soft-paper-deep)] p-4 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                Это бесплатный фрагмент. Полный разбор откроет остальные блоки и сохранение в Мою карту.
              </p>
            </>
          ) : (
            <p className="mt-3 font-heading text-xl italic leading-relaxed text-[var(--soft-ink-soft)]">
              Введите вопрос или данные — здесь появится первый настоящий фрагмент до оплаты.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
