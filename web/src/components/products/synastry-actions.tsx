"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { ArrowRight, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductPurchaseControls } from "@/components/products/product-purchase-controls";
import { SoftMarkdown } from "@/components/ui/soft-markdown";

type SynastryResult = {
  id: string;
  status: string;
  title: string;
  previewText: string | null;
  resultText: string | null;
  saved: boolean;
};

type ApiPayload = {
  hasEntitlement?: boolean;
  result?: SynastryResult;
  results?: SynastryResult[];
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

export function SynastryActions() {
  const { status: authStatus } = useSession();
  const [hasEntitlement, setHasEntitlement] = useState(false);
  const [result, setResult] = useState<SynastryResult | null>(null);
  const [userBirthData, setUserBirthData] = useState("");
  const [partnerBirthData, setPartnerBirthData] = useState("");
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    let cancelled = false;
    jsonRequest<ApiPayload>("/api/products/synastry")
      .then((payload) => {
        if (cancelled) return;
        setHasEntitlement(Boolean(payload.hasEntitlement));
        setResult(payload.results?.[0] ?? null);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [authStatus]);

  async function generateResult() {
    if (authStatus !== "authenticated") {
      setMessage("Войдите, чтобы открыть синастрию и сохранить результат в кабинете.");
      setStatus("error");
      return;
    }
    setStatus("loading");
    setMessage(null);
    try {
      const payload = await jsonRequest<ApiPayload>("/api/products/synastry", {
        method: "POST",
        body: JSON.stringify({ userBirthData, partnerBirthData, question }),
      });
      setHasEntitlement(Boolean(payload.hasEntitlement));
      setResult(payload.result ?? null);
      if (payload.paywalled) {
        setMessage("Бесплатный фрагмент готов. Полную синастрию можно открыть кредитами ясности или картой.");
      }
      setStatus("idle");
    } catch (error) {
      const typed = error as Error & { status?: number };
      if (typed.status === 400) {
        setMessage("Заполните данные рождения обоих участников: дата, примерное время и город.");
      } else if (typed.status === 402) {
        setMessage("Откройте доступ кредитами ясности или картой — полный результат появится здесь же.");
      } else {
        setMessage(typed.message || "Не удалось создать синастрию");
      }
      setStatus("error");
    }
  }

  async function saveToMap() {
    if (!result) return;
    setStatus("loading");
    setMessage(null);
    try {
      const payload = await jsonRequest<ApiPayload>(`/api/products/synastry/${result.id}`, {
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
    <div className="soft-card soft-form-panel mt-8" data-testid="synastry-actions">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="soft-eyebrow">получить продукт</p>
          <h2 className="soft-h3 mt-2">Синастрия</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Сначала можно получить один настоящий акцент по данным рождения. Полная синастрия открывается кредитами ясности или картой.
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

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="soft-card-flat p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block" htmlFor="synastry-user-birth-data">
              <span className="soft-eyebrow">ваши данные</span>
              <textarea
                id="synastry-user-birth-data"
                value={userBirthData}
                onChange={(event) => setUserBirthData(event.target.value)}
                placeholder="12.04.1992, 14:35, Москва"
                rows={4}
                className="soft-question-input mt-3"
                disabled={status === "loading"}
              />
            </label>
            <label className="block" htmlFor="synastry-partner-birth-data">
              <span className="soft-eyebrow">данные партнёра</span>
              <textarea
                id="synastry-partner-birth-data"
                value={partnerBirthData}
                onChange={(event) => setPartnerBirthData(event.target.value)}
                placeholder="09.11.1990, 08:10, Санкт-Петербург"
                rows={4}
                className="soft-question-input mt-3"
                disabled={status === "loading"}
              />
            </label>
          </div>
          <label className="mt-4 block" htmlFor="synastry-question">
            <span className="soft-eyebrow">вопрос пары</span>
            <textarea
              id="synastry-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Например: почему мы часто ссоримся перед важными решениями?"
              rows={4}
              className="soft-question-input mt-3"
              disabled={status === "loading"}
            />
          </label>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={generateResult}
              disabled={status === "loading"}
              className="soft-button soft-button-primary"
            >
              {hasEntitlement && <Sparkles className="size-4" aria-hidden="true" />}
              {status === "loading" ? "Собираем синастрию" : hasEntitlement ? "Получить полную синастрию" : "Бесплатный фрагмент"}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
            {!hasEntitlement && (
              <ProductPurchaseControls
                productKey="synastry"
                label="Открыть полностью"
                checkoutSource="synastry-direct"
                creditCost={5}
                onUnlocked={() => {
                  setHasEntitlement(true);
                  if (userBirthData.trim() && partnerBirthData.trim()) {
                    void generateResult();
                  } else {
                    setMessage("Доступ открыт. Добавьте данные рождения обоих участников — и получите результат здесь же.");
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
                data-testid="synastry-save"
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
                Это бесплатный фрагмент. Полная синастрия откроет карту ресурсов, различий и вопросов для разговора.
              </p>
            </>
          ) : (
            <p className="mt-3 font-heading text-xl italic leading-relaxed text-[var(--soft-ink-soft)]">
              Добавьте данные рождения обоих участников — здесь появится первый настоящий фрагмент до оплаты.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
