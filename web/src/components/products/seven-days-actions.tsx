"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowRight, CheckCircle2, LockKeyhole, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductPurchaseControls } from "@/components/products/product-purchase-controls";
import { appUrl } from "@/lib/subdomain";

type ClarityRoute = {
  id: string;
  status: string;
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

const DAYS = [
  { n: 1, t: "Услышать",           d: "Сегодня — только сформулировать. Без выводов. 5 минут." },
  { n: 2, t: "Замедлить",          d: "Заметить тело: где напряжение, где тепло. 7 минут." },
  { n: 3, t: "Развилка",           d: "Разделить: что зависит от вас, что — нет. 10 минут." },
  { n: 4, t: "Маленький эксперимент", d: "Один безопасный шаг — и заметить, что изменилось." },
  { n: 5, t: "Голос внутри",       d: "Поговорить с той частью себя, которая боится больше всего." },
  { n: 6, t: "Кому довериться",    d: "Выбрать одного человека, с которым можно разделить кусочек." },
  { n: 7, t: "Карта ясности",      d: "Собрать инсайты в одну страницу. Решить, что дальше." },
];

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
    return () => { cancelled = true; };
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
      const typed = error as Error & { status?: number };
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

  const currentDay = result?.currentDay ?? 0;
  const isActive = result?.status === "ACTIVE";
  const isCompleted = result?.status === "COMPLETED";

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

      {/* not started */}
      {!result && (
        <div className="mt-5">
          <p className="mt-2 mb-5 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Каждый день — один шаг: мысль, практика или вопрос. По 5–10 минут. Семь дней — и важный вопрос виден иначе.
          </p>
          <Button
            onClick={startRoute}
            disabled={!hasEntitlement || status === "loading" || status === "paying"}
            className="soft-button soft-button-primary"
          >
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
                onUnlocked={() => { setHasEntitlement(true); void startRoute(); }}
              />
            </div>
          )}
        </div>
      )}

      {/* progress tracker */}
      {result && (
        <>
          <div className="mt-5 rounded-[20px] p-5" style={{ background: "linear-gradient(160deg, #F4D9C1, #F8E6D1)" }}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="soft-eyebrow">прогресс</p>
                <p className="font-heading text-[1.75rem] font-semibold text-[var(--soft-bordeaux)]">
                  {isCompleted ? "Завершено!" : `День ${currentDay} из 7`}
                </p>
              </div>
              <div className="flex gap-1.5">
                {DAYS.map((d, i) => {
                  const done = i + 1 < currentDay;
                  const today = i + 1 === currentDay && !isCompleted;
                  return (
                    <div
                      key={d.n}
                      className="flex h-9 w-9 items-center justify-center rounded-lg font-heading text-sm font-medium"
                      style={{
                        background: done ? "var(--soft-bordeaux)" : today ? "var(--soft-terracotta-dark)" : "var(--soft-paper-card)",
                        color: done || today ? "#FBF0E1" : "var(--soft-ink-faint)",
                      }}
                    >
                      {done ? "✓" : d.n}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* day list */}
          <div className="mt-4 flex flex-col gap-3">
            {DAYS.map((d, i) => {
              const done = i + 1 < currentDay || isCompleted;
              const today = i + 1 === currentDay && !isCompleted;
              const future = i + 1 > currentDay && !isCompleted;
              return (
                <div
                  key={d.n}
                  className="rounded-[16px] p-4"
                  style={{
                    background: today ? "var(--soft-paper-card)" : done ? "var(--soft-paper-deep)" : "var(--soft-paper-card)",
                    opacity: future ? 0.6 : 1,
                    outline: today ? "2px solid var(--soft-terracotta-dark)" : "none",
                    outlineOffset: 1,
                  }}
                >
                  <div className="flex flex-wrap items-center gap-4">
                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full font-heading text-xl font-semibold"
                      style={{
                        background: done ? "var(--soft-bordeaux)" : today ? "var(--soft-terracotta-dark)" : "var(--soft-paper-edge)",
                        color: done || today ? "#FBF0E1" : "var(--soft-ink-faint)",
                      }}
                    >
                      {done ? <CheckCircle2 className="size-5" /> : d.n}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="soft-eyebrow">день {d.n}</p>
                      <p className="font-heading text-[1.2rem] font-medium text-[var(--soft-bordeaux)]">{d.t}</p>
                      <p className="mt-0.5 text-sm text-[var(--soft-ink-soft)]">{d.d}</p>
                    </div>
                    {today && (
                      <Button
                        onClick={completeDay}
                        disabled={status === "loading" || !isActive}
                        className="soft-button soft-button-primary shrink-0"
                        data-testid="seven-days-complete-day"
                      >
                        {status === "loading" ? "Сохраняем…" : "Прочитал · завершить день"}
                      </Button>
                    )}
                    {done && (
                      <span className="shrink-0 rounded-full border border-[var(--soft-paper-edge)] px-3 py-1 text-xs text-[var(--soft-ink-faint)]">
                        Перечитать
                      </span>
                    )}
                    {future && (
                      <span className="shrink-0 text-xs text-[var(--soft-ink-faint)]">Скоро</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* pause / resume */}
          {!isCompleted && (
            <div className="mt-5 flex flex-wrap gap-3">
              <Button onClick={togglePause} disabled={status === "loading"} className="soft-button soft-button-ghost">
                {isActive ? (
                  <><Pause className="size-4" aria-hidden="true" /> Сделать перерыв</>
                ) : (
                  <><Play className="size-4" aria-hidden="true" /> Возобновить маршрут</>
                )}
              </Button>
            </div>
          )}

          {isCompleted && (
            <div className="soft-card-flat mt-5 p-4 text-center">
              <p className="font-heading text-lg italic text-[var(--soft-ink-soft)] leading-relaxed">
                После 7-го дня мы соберём ваши инсайты в одну страницу — её можно сохранить, поделиться или взять с собой к специалисту.
              </p>
              {result.reportId && (
                <Link
                  href={appUrl(`/results/${result.reportId}`)}
                  className="soft-button soft-button-primary mt-4 inline-flex"
                  data-testid="seven-days-result-link"
                >
                  Посмотреть итоговый отчет
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
