"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { ArrowRight, Compass, LockKeyhole, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductPurchaseControls } from "@/components/products/product-purchase-controls";
import { SoftMarkdown } from "@/components/ui/soft-markdown";

type SymbolicResult = {
  id: string;
  status: string;
  title: string;
  previewText: string | null;
  resultText: string | null;
  saved: boolean;
};

type ApiPayload = {
  hasEntitlement?: boolean;
  result?: SymbolicResult;
  results?: SymbolicResult[];
  paywalled?: boolean;
  insufficientHistory?: boolean;
  itemCount?: number;
  minItems?: number;
  mapItemCount?: number;
  minMapItems?: number;
  canGenerateMap?: boolean;
  mapEmptyState?: string;
  emptyState?: string;
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
  productKey: "tarot" | "natal-chart" | "numerology" | "my-map";
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
  const [mapItemCount, setMapItemCount] = useState<number | null>(null);
  const [minMapItems, setMinMapItems] = useState(3);
  const historyDriven = productKey === "my-map";
  const hasEnoughMapHistory = !historyDriven || (mapItemCount !== null && mapItemCount >= minMapItems);
  const canAttemptGeneration = !historyDriven || authStatus !== "authenticated" || hasEnoughMapHistory;
  const canShowPurchaseControls = !historyDriven
    || authStatus !== "authenticated"
    || mapItemCount === null
    || hasEnoughMapHistory;

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    let cancelled = false;
    jsonRequest<ApiPayload>(`/api/products/symbolic?productKey=${productKey}`)
      .then((payload) => {
        if (cancelled) return;
        setHasEntitlement(Boolean(payload.hasEntitlement));
        setResult(payload.results?.[0] ?? null);
        if (historyDriven) {
          setMapItemCount(payload.mapItemCount ?? 0);
          setMinMapItems(payload.minMapItems ?? 3);
          setMessage(payload.mapEmptyState ?? null);
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [authStatus, historyDriven, productKey]);

  async function generateResult() {
    if (authStatus !== "authenticated") {
      setMessage("Войдите, чтобы открыть продукт и сохранить результат в кабинете.");
      setStatus("error");
      return;
    }
    if (!hasEnoughMapHistory) {
      setMessage(`Чтобы собрать расширенную карту, нужно ${minMapItems} сохранённых элемента. Сейчас есть ${mapItemCount ?? 0}.`);
      setStatus("error");
      return;
    }
    setStatus("loading");
    setMessage(null);
    try {
      const payload = await jsonRequest<ApiPayload>("/api/products/symbolic", {
        method: "POST",
        body: JSON.stringify(historyDriven ? { productKey } : { productKey, userInput }),
      });
      setHasEntitlement(Boolean(payload.hasEntitlement));
      if (historyDriven) {
        setMapItemCount(payload.itemCount ?? payload.mapItemCount ?? mapItemCount);
        setMinMapItems(payload.minItems ?? payload.minMapItems ?? minMapItems);
      }
      if (payload.insufficientHistory) {
        setResult(null);
        setMessage(payload.emptyState ?? "Сохраните ещё несколько элементов в Моей карте, чтобы собрать расширенную карту.");
        setStatus("idle");
        return;
      }
      setResult(payload.result ?? null);
      if (payload.paywalled) {
        setMessage(historyDriven
          ? "Бесплатный фрагмент из вашей истории готов. Полную карту можно открыть кредитами ясности или картой."
          : "Бесплатный фрагмент готов. Полный разбор можно открыть кредитами ясности или картой.");
      }
      setStatus("idle");
    } catch (error) {
      const typed = error as Error & { status?: number };
      if (typed.status === 402) {
        setMessage("Откройте доступ кредитами ясности или картой — полный результат появится здесь же.");
      } else {
        setMessage(typed.message || "Не удалось создать результат");
      }
      setStatus("error");
    }
  }

  // B308: real save → PATCH /api/products/symbolic/[id] with action: "save".
  // Spec (04_UI_UX_Mechanics §10) requires every symbolic result to be
  // saveable into My Map.
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

  return (
    <div className="soft-card soft-form-panel mt-8" data-testid={`symbolic-product-actions-${productKey}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="soft-eyebrow">получить продукт</p>
          <h2 className="soft-h3 mt-2">{title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            {historyDriven
              ? "Карта собирается из сохранённых вопросов, маршрутов и результатов. Бесплатно откроется 1 тема; полный разбор доступен кредитами ясности или картой."
              : "Сначала можно получить бесплатный фрагмент по вашему вводу. Полный разбор открывается кредитами ясности или картой."}
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
          {!historyDriven && (
            <>
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
            </>
          )}
          {historyDriven && (
            <div
              className="rounded-[18px] border border-[var(--soft-border)] bg-[var(--soft-paper)] p-4"
              data-testid="extended-map-history-state"
            >
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--soft-lilac)] text-[var(--soft-bordeaux)]">
                  <Compass className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="soft-eyebrow">{promptLabel}</p>
                  <p className="mt-1 font-heading text-xl text-[var(--soft-ink)]">
                    {authStatus === "authenticated" ? `${mapItemCount ?? 0} из ${minMapItems} элементов` : `нужно ${minMapItems} элемента`}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                {authStatus !== "authenticated"
                  ? "Войдите, чтобы мы проверили сохранённые вопросы, маршруты и результаты."
                  : hasEnoughMapHistory
                    ? "Истории достаточно: можно собрать бесплатный фрагмент и затем открыть полную карту."
                    : "Пока недостаточно истории. Сохраните вопросы, маршруты или результаты разборов в Моей карте."}
              </p>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={generateResult}
              disabled={status === "loading" || !canAttemptGeneration}
              className="soft-button soft-button-primary"
            >
              {hasEntitlement && <LockKeyhole className="size-4" aria-hidden="true" />}
              {status === "loading" ? "Собираем результат" : hasEntitlement ? "Получить полный результат" : "Бесплатный фрагмент"}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
            {!hasEntitlement && canShowPurchaseControls && (
              <ProductPurchaseControls
                productKey={productKey}
                label="Открыть полностью"
                checkoutSource={`${productKey}-direct`}
                creditCost={creditCost}
                onUnlocked={() => {
                  setHasEntitlement(true);
                  if (historyDriven) {
                    void generateResult();
                  } else if (userInput.trim()) {
                    void generateResult();
                  } else {
                    setMessage("Доступ открыт. Добавьте данные или вопрос — и получите результат здесь же.");
                  }
                }}
              />
            )}
          </div>
        </div>

        <div className="soft-card p-5">
          <p className="soft-eyebrow">результат</p>
          {result?.resultText ? (
            <>
              <SoftMarkdown
                content={result.resultText}
                className="mt-3 font-heading text-[1.08rem] text-[var(--soft-ink)]"
              />
              <Button
                type="button"
                onClick={saveToMap}
                disabled={result.saved || status === "loading"}
                className="soft-button soft-button-ghost mt-5"
                data-testid={`symbolic-save-${productKey}`}
              >
                <Save className="size-4" aria-hidden="true" />
                {result.saved ? "Сохранено в Мою карту" : status === "loading" ? "Сохраняем…" : "Сохранить в Мою карту"}
              </Button>
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
              {historyDriven
                ? "Здесь появится 1 тема из ваших сохранённых вопросов, маршрутов и результатов."
                : "Введите вопрос или данные — здесь появится первый настоящий фрагмент до оплаты."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
