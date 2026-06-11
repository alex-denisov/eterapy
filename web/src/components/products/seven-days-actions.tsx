"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowRight, CheckCircle2, LockKeyhole, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductIntake } from "@/components/products/product-intake";
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

type DayContent = {
  n: number;
  t: string;
  d: string;
  // B310: expand each day with a body, a journal prompt, and a duration —
  // before this, "Открыть" advanced state without delivering any content,
  // which is the exact UX flaw the user flagged.
  body: string;
  journalPrompt: string;
  durationMin: number;
};

const DAYS: DayContent[] = [
  {
    n: 1,
    t: "Услышать",
    d: "Сегодня — только сформулировать. Без выводов. 5 минут.",
    body: "Запишите тот вопрос, который занимает вас сейчас, своими словами. Не пытайтесь его улучшить или сделать «правильным» — просто как есть. Если внутри несколько слоёв, разрешите им быть всем.",
    journalPrompt: "Если бы я мог рассказать этот вопрос одному человеку, которому полностью доверяю — какими словами я бы начал?",
    durationMin: 5,
  },
  {
    n: 2,
    t: "Замедлить",
    d: "Заметить тело: где напряжение, где тепло. 7 минут.",
    body: "Сядьте удобно. Проследите, где в теле эта тема живёт прямо сейчас. Не пытайтесь «починить» — только заметить и описать без оценок.",
    journalPrompt: "Какая часть тела громче всего откликается на эту тему? Какое это ощущение — на что похоже?",
    durationMin: 7,
  },
  {
    n: 3,
    t: "Развилка",
    d: "Разделить: что зависит от вас, что — нет. 10 минут.",
    body: "Возьмите чистый лист. Слева — что в этой ситуации зависит только от вас. Справа — что не зависит. Граница часто проходит не там, где кажется на первый взгляд.",
    journalPrompt: "Что я могу сделать своим действием, а что — нет, как бы я ни старался?",
    durationMin: 10,
  },
  {
    n: 4,
    t: "Маленький эксперимент",
    d: "Один безопасный шаг — и заметить, что изменилось.",
    body: "Выберите один маленький эксперимент: не решение, а опыт. Что-то, что можно сделать сегодня и потом заметить эффект. Маленький — значит безопасный.",
    journalPrompt: "Какой один маленький шаг я могу попробовать сегодня — такой, чтобы он ничего не ломал, но что-то немного сдвигал?",
    durationMin: 10,
  },
  {
    n: 5,
    t: "Голос внутри",
    d: "Поговорить с той частью себя, которая боится больше всего.",
    body: "Та часть вас, которая боится — что она хочет защитить? Попробуйте написать ей коротко: «Я слышу тебя. Чего ты боишься?» — и посмотрите, что приходит в ответ.",
    journalPrompt: "Если бы испуганная часть меня могла говорить вслух — что бы она сказала?",
    durationMin: 10,
  },
  {
    n: 6,
    t: "Кому довериться",
    d: "Выбрать одного человека, с которым можно разделить кусочек.",
    body: "Выберите одного человека, которому можно рассказать один маленький кусочек темы. Не всю — только то, что хочется разделить. Цель — не получить совет, а перестать нести одному.",
    journalPrompt: "Кто этот человек? Какую часть истории я хочу рассказать? И что мне НЕ нужно от него — совет, оценку, решение?",
    durationMin: 10,
  },
  {
    n: 7,
    t: "Итоговая карта",
    d: "Собрать инсайты в одну страницу. Решить, что дальше.",
    body: "Сегодня — итог. Что вы заметили за неделю? Что окрепло, что стихло? Какой один следующий шаг вы хотите взять с собой? После сохранения мы соберём это в карту, которую можно перечитать или поделиться со специалистом.",
    journalPrompt: "Если бы я мог взять в следующую неделю одно решение, одно ощущение и один вопрос — какие они?",
    durationMin: 15,
  },
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
      setMessage("Войдите, чтобы начать маршрут — первый день бесплатно.");
      setStatus("error");
      return;
    }
    setStatus("loading");
    setMessage(null);
    try {
      // G9: day 1 is free, so START no longer requires an entitlement.
      const payload = await jsonRequest<ApiPayload>("/api/products/seven-days", {
        method: "POST",
        body: JSON.stringify({ action: "start", dialogueId }),
      });
      setHasEntitlement(Boolean(payload.hasEntitlement));
      setResult(payload.result ?? null);
      setStatus("idle");
    } catch (error) {
      const typed = error as Error & { status?: number };
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
      const typed = error as Error & { status?: number };
      if (typed.status === 402) {
        // G9: paywall hit when advancing past the free day 1.
        setHasEntitlement(false);
        setMessage("День 1 бесплатный. Откройте полный маршрут, чтобы продолжить к дням 2–7.");
        setStatus("error");
        return;
      }
      setMessage(typed.message || "Не удалось завершить день");
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
      <ProductIntake
        productKey="seven-days"
        mode="full"
        title="Маршрут строится на вашей ситуации"
        description="Соберём вопрос и несколько уточнений внутри маршрута, чтобы день 1 был связан с вашей реальной развилкой."
        submitLabel="Начать с вопроса"
        readyLabel="Контекст готов. Возвращаем вас к маршруту."
        testId="seven-days-no-dialogue"
      />
    );
  }

  // G9 · The latest route is either an in-progress cycle or a finished one.
  // Splitting them lets us (a) always offer a fresh start when nothing is
  // active and (b) keep the finished cycle's report reachable next to the
  // "new cycle" CTA.
  const activeRoute = result && result.status !== "COMPLETED" ? result : null;
  const completedRoute = result && result.status === "COMPLETED" ? result : null;
  const currentDay = activeRoute?.currentDay ?? 0;
  const isActive = activeRoute?.status === "ACTIVE";

  return (
    <div className="soft-card soft-form-panel mt-8" data-testid="seven-days-actions">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="soft-eyebrow">маршрут</p>
          <h2 className="soft-h3 mt-2">7 дней</h2>
        </div>
        <span className={hasEntitlement ? "soft-badge soft-badge-warm" : "soft-badge"}>
          {hasEntitlement ? "доступ открыт" : "день 1 бесплатно"}
        </span>
      </div>

      {message && (
        <p className="mt-4 rounded-2xl bg-[var(--soft-paper-deep)] p-3 text-sm text-[var(--soft-bordeaux)]">
          {message}
        </p>
      )}

      {/* completed cycle summary + new-cycle entry */}
      {completedRoute && (
        <div className="soft-card-flat mt-5 p-4 text-center" data-testid="seven-days-completed">
          <p className="soft-eyebrow">прошлый цикл завершён</p>
          <p className="mt-2 font-heading text-lg italic text-[var(--soft-ink-soft)] leading-relaxed">
            Мы собрали ваши инсайты в одну страницу — её можно сохранить, поделиться или взять с собой к специалисту.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            {completedRoute.reportId && (
              <Link
                href={appUrl(`/results/${completedRoute.reportId}`)}
                className="soft-button soft-button-primary inline-flex"
                data-testid="seven-days-result-link"
              >
                Посмотреть итоговый отчет
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>
      )}

      {completedRoute && !dialogueId && (
        <ProductIntake
          productKey="seven-days"
          mode="full"
          title="Новый цикл с другим вопросом"
          description="Соберём новый контекст здесь же и откроем старт маршрута для свежей ситуации."
          submitLabel="Начать новый цикл"
          readyLabel="Новый контекст готов. Возвращаем вас к маршруту."
          testId="seven-days-new-cycle"
        />
      )}

      {/* start a (new) route — shown whenever no cycle is active. Day 1 is
          free; payment is asked for only when advancing past it. */}
      {!activeRoute && dialogueId && (
        <div className="mt-5" data-testid="seven-days-start-block">
          <p className="mt-2 mb-5 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Каждый день — один шаг: мысль, практика или вопрос. По 5–10 минут. Первый день — бесплатно,
            чтобы попробовать. Дни 2–7, прогресс и итоговый отчёт открываются по оплате маршрута.
          </p>
          <Button
            onClick={startRoute}
            disabled={status === "loading" || status === "paying"}
            className="soft-button soft-button-primary"
            data-testid="seven-days-start"
          >
            <Play className="size-4" aria-hidden="true" />
            {completedRoute ? "Начать новый цикл — день 1 бесплатно" : "Начать — первый день бесплатно"}
          </Button>
        </div>
      )}

      {/* progress tracker for the active cycle */}
      {activeRoute && (
        <>
          <div className="mt-5 rounded-[20px] p-5" style={{ background: "linear-gradient(160deg, #F4D9C1, #F8E6D1)" }}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="soft-eyebrow">прогресс</p>
                <p className="font-heading text-[1.75rem] font-semibold text-[var(--soft-bordeaux)]">
                  {`День ${currentDay} из 7`}
                </p>
              </div>
              <div className="flex gap-1.5">
                {DAYS.map((d, i) => {
                  const done = i + 1 < currentDay;
                  const today = i + 1 === currentDay;
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

          {/* B310: Today's day content — expanded card with body + journal
              prompt + duration. Spec DoD §9 requires per-day micro-result. */}
          {currentDay >= 1 && currentDay <= 7 && (() => {
            const today = DAYS[currentDay - 1];
            return (
              <div
                className="mt-4 rounded-[20px] p-6"
                style={{
                  background: "linear-gradient(160deg, #FFFCF5 0%, #F4D9C1 100%)",
                  outline: "2px solid var(--soft-terracotta-dark)",
                  outlineOffset: 1,
                }}
                data-testid="seven-days-today-card"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="soft-eyebrow text-[var(--soft-terracotta-dark)]">
                    день {today.n} · сегодня · ~{today.durationMin} минут
                  </span>
                </div>
                <h3
                  className="mt-2 font-heading italic text-[var(--soft-bordeaux)]"
                  style={{ fontSize: "clamp(1.5rem, 2.4vw, 2rem)", lineHeight: 1.15 }}
                  data-testid="seven-days-today-title"
                >
                  {today.t}
                </h3>
                <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-[var(--soft-ink)]">
                  {today.body}
                </p>
                <div className="mt-4 rounded-[14px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4">
                  <p className="soft-eyebrow">вопрос на сегодня</p>
                  <p className="mt-2 font-heading text-[1.05rem] italic leading-relaxed text-[var(--soft-bordeaux)]">
                    {today.journalPrompt}
                  </p>
                </div>

                {/* G9: day-1 paywall gate. Day 1 is free to read + reflect on;
                    finishing it (to unlock days 2–7 + the report) is paid. */}
                {currentDay === 1 && !hasEntitlement ? (
                  <div
                    className="mt-5 rounded-[14px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4"
                    data-testid="seven-days-day1-paywall"
                  >
                    <div className="flex items-center gap-2">
                      <LockKeyhole className="size-4 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
                      <p className="soft-eyebrow text-[var(--soft-terracotta-dark)]">дальше — по оплате</p>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                      Первый день — бесплатно. Чтобы пройти дни 2–7, видеть прогресс и получить итоговый
                      отчёт с сохранением в карту, откройте полный маршрут.
                    </p>
                    <div className="mt-3">
                      <ProductPurchaseControls
                        productKey="seven-days"
                        label="Открыть маршрут"
                        checkoutSource="seven-days-day1-gate"
                        creditCost={8}
                        onUnlocked={() => setHasEntitlement(true)}
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <Button
                      onClick={completeDay}
                      disabled={status === "loading" || !isActive}
                      className="soft-button soft-button-primary mt-5"
                      data-testid="seven-days-complete-day"
                    >
                      {status === "loading" ? "Сохраняем…" : "Готово · завершить день"}
                    </Button>
                    {!isActive && (
                      <p className="mt-2 text-xs text-[var(--soft-ink-faint)]">
                        Маршрут на паузе — возобновите его кнопкой ниже, чтобы завершить день.
                      </p>
                    )}
                  </>
                )}
              </div>
            );
          })()}

          {/* day list */}
          <div className="mt-4 flex flex-col gap-3">
            {DAYS.map((d, i) => {
              const done = i + 1 < currentDay;
              const today = i + 1 === currentDay;
              const future = i + 1 > currentDay;
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
                      <span className="shrink-0 rounded-full bg-[var(--soft-terracotta-dark)] px-3 py-1 text-xs font-semibold text-[#FBF0E1]">
                        сейчас выше ↑
                      </span>
                    )}
                    {done && (
                      <span className="shrink-0 rounded-full border border-[var(--soft-paper-edge)] px-3 py-1 text-xs text-[var(--soft-ink-faint)]">
                        Перечитать
                      </span>
                    )}
                    {future && (
                      <span className="shrink-0 text-xs text-[var(--soft-ink-faint)]">
                        {i + 1 === 2 && !hasEntitlement ? "По оплате" : "Скоро"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* pause / resume */}
          <div className="mt-5 flex flex-wrap gap-3">
            <Button onClick={togglePause} disabled={status === "loading"} className="soft-button soft-button-ghost">
              {isActive ? (
                <><Pause className="size-4" aria-hidden="true" /> Сделать перерыв</>
              ) : (
                <><Play className="size-4" aria-hidden="true" /> Возобновить маршрут</>
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
