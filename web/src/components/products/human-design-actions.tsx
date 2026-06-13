"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { ArrowRight, Compass, Download, LockKeyhole, Save, Share2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductPurchaseControls } from "@/components/products/product-purchase-controls";
import { SoftMarkdown } from "@/components/ui/soft-markdown";
import { HumanDesignBodygraph } from "@/components/products/human-design-bodygraph";
import type { HumanDesignChart } from "@/lib/human-design-data";
import { track } from "@/lib/analytics";
import { SHARE_EVENTS, withReferral } from "@/lib/share";

type SymbolicResult = {
  id: string;
  status: string;
  title: string;
  previewText: string | null;
  resultText: string | null;
  saved: boolean;
  metadata?: unknown;
};

type FreePayload = {
  ok?: boolean;
  needsBirthData?: boolean;
  message?: string;
  chart?: HumanDesignChart;
  display?: string;
  hasExactTime?: boolean;
};

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

const PLACEHOLDER = "Например: 15.05.1990, 10:30, Москва. Точное время и город важны для верного расчёта.";

function chartFromResultMetadata(result: SymbolicResult | null): HumanDesignChart | null {
  const md = result?.metadata;
  if (!md || typeof md !== "object") return null;
  const meta = md as Record<string, unknown>;
  const nested = (meta.generationMetadata ?? meta.previewGenerationMetadata) as Record<string, unknown> | undefined;
  const raw = (nested?.chart ?? meta.chart) as unknown;
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as { type?: unknown; centers?: unknown };
  if (typeof candidate.type !== "string" || !Array.isArray(candidate.centers)) return null;
  return raw as HumanDesignChart;
}

function TypeBadge({ chart }: { chart: HumanDesignChart }) {
  return (
    <div className="rounded-[20px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-5" data-testid="hd-type-card">
      <p className="soft-eyebrow">ваш тип</p>
      <h3 className="mt-1 font-heading text-[1.7rem] italic leading-tight text-[var(--soft-bordeaux)]">{chart.typeName}</h3>
      <p className="mt-1 text-sm text-[var(--soft-ink-soft)]">«{chart.shareLine}»</p>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="soft-eyebrow text-[0.6rem]">стратегия</p>
          <p className="mt-0.5 text-[var(--soft-ink)]">{chart.strategy}</p>
        </div>
        <div>
          <p className="soft-eyebrow text-[0.6rem]">внутренний авторитет</p>
          <p className="mt-0.5 text-[var(--soft-ink)]">{chart.authorityName}</p>
        </div>
        <div>
          <p className="soft-eyebrow text-[0.6rem]">профиль</p>
          <p className="mt-0.5 text-[var(--soft-ink)]">{chart.profile} · {chart.profileName}</p>
        </div>
        <div>
          <p className="soft-eyebrow text-[0.6rem]">подпись / не-я</p>
          <p className="mt-0.5 text-[var(--soft-ink)]">{chart.signature} · не {chart.notSelf.toLowerCase()}</p>
        </div>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{chart.typeSummary}</p>
      {!chart.hasExactTime && (
        <p className="mt-3 rounded-[14px] bg-[var(--soft-paper-deep)] p-3 text-xs leading-relaxed text-[var(--soft-bordeaux)]">
          Время рождения не указано — тип посчитан на полдень. Для точного результата добавьте точное время и город.
        </p>
      )}
    </div>
  );
}

export function HumanDesignActions({ creditCost }: { creditCost: number }) {
  const { status: authStatus } = useSession();
  const [birth, setBirth] = useState("");
  const [chart, setChart] = useState<HumanDesignChart | null>(null);
  const [freeStatus, setFreeStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);

  const [hasEntitlement, setHasEntitlement] = useState(false);
  const [reading, setReading] = useState<SymbolicResult | null>(null);
  const [readingStatus, setReadingStatus] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    let cancelled = false;
    jsonRequest<ApiPayload>("/api/products/symbolic?productKey=human-design")
      .then((payload) => {
        if (cancelled) return;
        setHasEntitlement(Boolean(payload.hasEntitlement));
        const last = payload.results?.[0] ?? null;
        setReading(last);
        const stored = chartFromResultMetadata(last);
        if (stored) setChart((current) => current ?? stored);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [authStatus]);

  async function computeFreeType() {
    if (!birth.trim()) {
      setMessage("Введите дату рождения (а лучше — время и город).");
      setFreeStatus("error");
      return;
    }
    setFreeStatus("loading");
    setMessage(null);
    setShareNote(null);
    try {
      const payload = await jsonRequest<FreePayload>("/api/products/human-design", {
        method: "POST",
        body: JSON.stringify({ birth }),
      });
      if (!payload.ok || !payload.chart) {
        setChart(null);
        setMessage(payload.message ?? "Не удалось определить тип. Проверьте дату рождения.");
        setFreeStatus("idle");
        return;
      }
      setChart(payload.chart);
      setFreeStatus("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось определить тип");
      setFreeStatus("error");
    }
  }

  async function generateReading() {
    if (authStatus !== "authenticated") {
      setMessage("Войдите, чтобы открыть полный разбор и сохранить его в кабинете.");
      return;
    }
    if (!birth.trim()) {
      setMessage("Сначала укажите данные рождения и рассчитайте тип.");
      return;
    }
    setReadingStatus("loading");
    setMessage(null);
    try {
      const payload = await jsonRequest<ApiPayload>("/api/products/symbolic", {
        method: "POST",
        body: JSON.stringify({ productKey: "human-design", userInput: birth }),
      });
      setHasEntitlement(Boolean(payload.hasEntitlement));
      setReading(payload.result ?? null);
      const stored = chartFromResultMetadata(payload.result ?? null);
      if (stored) setChart(stored);
      if (payload.paywalled) {
        setMessage("Бесплатный фрагмент разбора готов. Полный разбор откроется баллами или картой здесь же.");
      }
      setReadingStatus("idle");
    } catch (error) {
      const typed = error as Error & { status?: number };
      setMessage(typed.status === 402
        ? "Откройте полный разбор баллами или картой — он появится здесь же."
        : typed.message || "Не удалось собрать разбор");
      setReadingStatus("error");
    }
  }

  async function saveReading() {
    if (!reading) return;
    setReadingStatus("loading");
    try {
      const payload = await jsonRequest<ApiPayload>(`/api/products/symbolic/${reading.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "save" }),
      });
      setReading(payload.result ?? reading);
      setReadingStatus("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить");
      setReadingStatus("error");
    }
  }

  async function shareType() {
    if (!chart) return;
    track({ event: SHARE_EVENTS.generated, surface: "human-design", properties: { kind: "human-design", type: chart.type } });
    const base = typeof window !== "undefined" ? `${window.location.origin}/products/human-design` : "";
    const url = withReferral(base, "hd-type");
    const text = `Мой тип в Дизайне человека — ${chart.typeName} (${chart.profile}). Стратегия: ${chart.strategy.toLowerCase()}. Узнать свой тип:`;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: "Мой Дизайн человека", text, url });
        return;
      }
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(`${text} ${url}`);
        setShareNote("Скопировано — можно вставить в чат или сторис.");
      }
    } catch {
      setShareNote(null);
    }
  }

  return (
    <div className="soft-card soft-form-panel mt-8" data-testid="human-design-actions">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="soft-eyebrow">узнать бесплатно</p>
          <h2 className="soft-h3 mt-2">Ваш тип в Дизайне человека</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Тип, стратегия, авторитет и бодиграф считаются по реальным данным рождения — бесплатно. Полный разбор с расшифровкой каналов и линий открывается баллами или картой.
          </p>
        </div>
        <span className={hasEntitlement ? "soft-badge soft-badge-warm" : "soft-badge"}>
          {hasEntitlement ? "разбор открыт" : "тип бесплатно"}
        </span>
      </div>

      {message && (
        <p className="mt-4 rounded-2xl bg-[var(--soft-paper-deep)] p-3 text-sm text-[var(--soft-bordeaux)]">{message}</p>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)]">
        <div className="soft-card-flat p-5">
          <label className="soft-eyebrow" htmlFor="hd-birth-input">Дата, время и место рождения</label>
          <textarea
            id="hd-birth-input"
            value={birth}
            onChange={(event) => setBirth(event.target.value)}
            placeholder={PLACEHOLDER}
            rows={4}
            className="soft-question-input mt-3"
            disabled={freeStatus === "loading"}
          />
          <Button
            type="button"
            onClick={computeFreeType}
            disabled={freeStatus === "loading"}
            className="soft-button soft-button-primary mt-4 w-full"
            data-testid="hd-compute"
          >
            <Sparkles className="size-4" aria-hidden="true" />
            {freeStatus === "loading" ? "Считаем бодиграф" : "Рассчитать тип бесплатно"}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>

          {chart && (
            <div className="mt-5">
              <p className="soft-eyebrow">активные ворота</p>
              <div className="mt-2 flex flex-wrap gap-1.5" data-testid="hd-active-gates">
                {chart.activeGates.map((gate) => (
                  <span key={gate} className="soft-chip text-[0.7rem]">{gate}</span>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button type="button" onClick={shareType} className="soft-button soft-button-ghost" data-testid="hd-share">
                  <Share2 className="size-4" aria-hidden="true" />
                  Поделиться типом
                </Button>
              </div>
              {shareNote && <p className="mt-2 text-xs text-[var(--soft-ink-soft)]">{shareNote}</p>}
            </div>
          )}
        </div>

        <div className="soft-card p-5">
          {chart ? (
            <div className="grid gap-5">
              <HumanDesignBodygraph chart={chart} />
              <TypeBadge chart={chart} />

              <div className="border-t border-[var(--soft-paper-edge)] pt-5">
                <p className="soft-eyebrow">полный разбор</p>
                {reading?.resultText ? (
                  <>
                    <SoftMarkdown content={reading.resultText} className="mt-3 font-heading text-[1.05rem] text-[var(--soft-ink)]" />
                    <div className="mt-4 flex flex-wrap gap-3">
                      <Button type="button" onClick={saveReading} disabled={reading.saved || readingStatus === "loading"} className="soft-button soft-button-ghost" data-testid="hd-save">
                        <Save className="size-4" aria-hidden="true" />
                        {reading.saved ? "Сохранено в Дневник" : "Сохранить в Дневник"}
                      </Button>
                      <a href={`/products/print/${reading.id}`} target="_blank" rel="noopener noreferrer" className="soft-button soft-button-ghost" data-testid="hd-pdf">
                        <Download className="size-4" aria-hidden="true" />
                        Скачать PDF
                      </a>
                    </div>
                  </>
                ) : reading?.previewText ? (
                  <>
                    <SoftMarkdown content={reading.previewText} className="mt-3 font-heading text-[1.05rem] text-[var(--soft-ink)]" />
                    <p className="mt-3 rounded-[14px] bg-[var(--soft-paper-deep)] p-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                      Это бесплатный фрагмент. Полный разбор раскроет каналы, линии профиля и практический маршрут.
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                    Полный разбор объяснит ваши каналы, профиль и как мягко жить по своей стратегии и авторитету.
                  </p>
                )}

                <div className="mt-4 flex flex-col gap-3">
                  {hasEntitlement ? (
                    <Button type="button" onClick={generateReading} disabled={readingStatus === "loading"} className="soft-button soft-button-primary" data-testid="hd-generate">
                      <LockKeyhole className="size-4" aria-hidden="true" />
                      {readingStatus === "loading" ? "Собираем разбор" : "Получить полный разбор"}
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </Button>
                  ) : (
                    <>
                      <ProductPurchaseControls
                        productKey="human-design"
                        label="Открыть полный разбор"
                        checkoutSource="human-design-direct"
                        creditCost={creditCost}
                        onUnlocked={() => {
                          setHasEntitlement(true);
                          void generateReading();
                        }}
                      />
                      <button
                        type="button"
                        onClick={generateReading}
                        disabled={readingStatus === "loading"}
                        className="self-start text-sm font-medium text-[var(--soft-bordeaux)] underline underline-offset-4 disabled:opacity-50"
                        data-testid="hd-free-fragment"
                      >
                        {readingStatus === "loading" ? "Собираем фрагмент…" : "Сначала бесплатный фрагмент"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid min-h-[18rem] place-items-center text-center">
              <div>
                <Compass className="mx-auto size-10 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
                <p className="mt-3 font-heading text-xl italic leading-relaxed text-[var(--soft-ink-soft)]">
                  Введите данные рождения — здесь появится ваш бодиграф и тип.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
