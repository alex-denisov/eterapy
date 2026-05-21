"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowRight, CheckCircle2, Pause, Play, Download, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductPurchaseControls } from "@/components/products/product-purchase-controls";

type ClarityRoute = {
  id: string;
  status: string; // ACTIVE | PAUSED | COMPLETED | CANCELLED
  currentDay: number;
  reportId: string | null;
};

type ApiPayload = {
  hasEntitlement?: boolean;
  result?: ClarityRoute;
  results?: ClarityRoute[];
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

export function SevenDaysActions({ dialogueId }: { dialogueId?: string | null }) {
  const { status: authStatus } = useSession();
  const [result, setResult] = useState<ClarityRoute | null>(null);
  const [hasEntitlement, setHasEntitlement] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "paying" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const isAuthenticated = authStatus === "authenticated";

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    let cancelled = false;
    jsonRequest<ApiPayload>("/api/products/seven-days")
      .then((payload) => {
        if (cancelled) return;
        setHasEntitlement(Boolean(payload.hasEntitlement));
        setResult(payload.results?.[0] ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [authStatus]);

  async function startRoute() {
    if (!dialogueId) return;
    if (!isAuthenticated) {
      setMessage("Войдите, чтобы открыть маршрут с баланса, кредитами ясности или картой.");
      setStatus("error");
      return;
    }
    setStatus("loading");
    setMessage(null);
    try {
      const payload = await jsonRequest<ApiPayload>("/api/products/seven-days", {
        method: "POST",
        body: JSON.stringify({ action: "start", dialogueId }),
      });
      setHasEntitlement(Boolean(payload.hasEntitlement));
      setResult(payload.result ?? null);
      setStatus("idle");
    } catch (error) {
      const typed = error as Error & { status?: number; payload?: ApiPayload };
      if (typed.status === 402) {
        setMessage("Откройте маршрут с баланса, кредитами ясности или картой — после этого день 1 начнется здесь же.");
        setStatus("error");
        return;
      }
      setMessage(typed.message || "Не удалось начать маршрут");
      setStatus("error");
    }
  }

  async function completeDay() {
    if (!result?.id) return;
    setStatus("loading");
    setMessage(null);
    try {
      const payload = await jsonRequest<ApiPayload>(`/api/products/seven-days/${result.id}/days/${result.currentDay}`, {
        method: "POST",
        body: JSON.stringify({ action: "complete" }),
      });
      setResult(payload.result ?? null);
      setStatus("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось завершить день");
      setStatus("error");
    }
  }

  async function togglePause() {
    if (!result?.id) return;
    setStatus("loading");
    setMessage(null);
    const action = result.status === "ACTIVE" ? "pause" : "resume";
    try {
      const payload = await jsonRequest<ApiPayload>(`/api/products/seven-days/${result.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      setResult(payload.result ?? null);
      setStatus("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось изменить статус");
      setStatus("error");
    }
  }

  if (!dialogueId && !result) {
    return (
      <div className="soft-card soft-form-panel mt-8" data-testid="seven-days-no-dialogue">
        <h2 className="soft-h3 mt-3">Маршрут строится на вашей ситуации</h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
          Сначала ответьте на пару вопросов в диалоге, чтобы мы могли подобрать 7 шагов для вас.
        </p>
        <Link href="/checkin?nextProduct=seven-days" className="soft-button soft-button-primary mt-5">
          Начать с вопроса
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    );
  }

  return (
    <div className="soft-card soft-form-panel mt-8" data-testid="seven-days-actions">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="soft-eyebrow">маршрут</p>
          <h2 className="soft-h3 mt-2">7 дней к ясности</h2>
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
          <p className="text-sm text-[var(--soft-ink-soft)] mb-4">
            Каждый день мы будем присылать один шаг: мысль, практику или вопрос. 
            Первый шаг бесплатный, остальные открываются после оплаты.
          </p>
          <Button onClick={startRoute} disabled={!hasEntitlement || status === "loading" || status === "paying"} className="soft-button soft-button-primary">
            <LockKeyhole className="size-4" aria-hidden="true" />
            Начать маршрут
          </Button>
          {!hasEntitlement && (
            <div className="mt-3">
              <ProductPurchaseControls
                productKey="seven-days"
                label="Открыть с баланса"
                checkoutSource="seven-days-start"
                creditCost={8}
                onUnlocked={() => {
                  setHasEntitlement(true);
                  startRoute();
                }}
              />
            </div>
          )}
        </div>
      )}

      {result && result.status !== "COMPLETED" && (
        <div className="mt-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading text-xl text-[var(--soft-ink)]">День {result.currentDay} из 7</h3>
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--soft-ink-faint)]">
              {result.status === "PAUSED" ? "на паузе" : "активен"}
            </span>
          </div>

          <div className="soft-card-flat p-4 mb-4 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            <p>Задание на сегодня будет здесь. Это плейсхолдер текста дня.</p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={completeDay} disabled={status === "loading" || result.status === "PAUSED"} className="soft-button soft-button-primary">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Отметить как выполненное
            </Button>
            <Button onClick={togglePause} disabled={status === "loading"} className="soft-button soft-button-ghost">
              {result.status === "ACTIVE" ? (
                <><Pause className="size-4" aria-hidden="true" /> Сделать перерыв</>
              ) : (
                <><Play className="size-4" aria-hidden="true" /> Возобновить маршрут</>
              )}
            </Button>
          </div>
        </div>
      )}

      {result && result.status === "COMPLETED" && (
        <div className="mt-5">
          <h3 className="font-heading text-xl text-[var(--soft-ink)] text-green-700">Маршрут завершен!</h3>
          <p className="text-sm text-[var(--soft-ink-soft)] mt-2">Вы прошли все 7 дней. Итоговый отчет готов.</p>
          <Link href={`/cabinet/results/${result.reportId}`} className="soft-button soft-button-primary mt-4">
            <Download className="size-4" aria-hidden="true" />
            Посмотреть итоговый отчет
          </Link>
        </div>
      )}
    </div>
  );
}
