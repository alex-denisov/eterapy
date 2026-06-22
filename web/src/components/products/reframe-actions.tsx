"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowLeft, ArrowRight, BookOpen, Download, LockKeyhole, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductPurchaseControls } from "@/components/products/product-purchase-controls";
import { NextStepCard } from "@/components/products/next-step-card";
import { SoftMarkdown } from "@/components/ui/soft-markdown";
import { getNextStepRecommendation } from "@/lib/product-recommendations";
import { appUrl, loginUrl } from "@/lib/subdomain";

// B441 (M28): «Переосмысление» — самодостаточная услуга (когнитивный рефрейминг).
// Контекст собирается ВНУТРИ услуги (textarea + чипы), без первичного диалога.
// Один экран; платный результат — 4 линзы; автосейв в Дневник; сессионность.

type ReframeAngle = {
  id: "thoughts" | "feelings" | "reframe" | "step";
  title: string;
  subtitle: string;
  facts: string[];
  unknowns: string[];
  options: string[];
  ask: string;
  step: string;
};

function tryParseReframe(text: string): { angles: ReframeAngle[] } | null {
  if (!text) return null;
  try {
    const raw = JSON.parse(text) as { angles?: unknown };
    if (!Array.isArray(raw.angles) || raw.angles.length < 4) return null;
    return raw as { angles: ReframeAngle[] };
  } catch {
    return null;
  }
}

type ReframeResult = {
  id: string;
  status: string;
  title: string;
  previewText: string | null;
  resultText: string | null;
  saved: boolean;
};

type ApiPayload = {
  hasEntitlement?: boolean;
  result?: ReframeResult;
  results?: ReframeResult[];
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

const ANGLE_STYLES: Record<string, { bg: string; color: string }> = {
  thoughts: { bg: "linear-gradient(140deg, #F4D9C1, #F8E6D1)", color: "#5C2A2C" },
  feelings: { bg: "linear-gradient(140deg, #E8C4B8, #F4D5C8)", color: "#5C2A2C" },
  reframe:  { bg: "linear-gradient(140deg, #DBD3EA, #E8E1F2)", color: "#4A3E5E" },
  step:     { bg: "linear-gradient(140deg, #D6DECC, #E5EBDC)", color: "#3A4A36" },
};

const ANGLE_GLYPHS: Record<string, string> = {
  thoughts: "✎",
  feelings: "♡",
  reframe: "↻",
  step: "↗",
};

// B441: контекст-чипы первого экрана (опционально уточняют рефрейминг).
const TOPICS = ["работа", "отношения", "семья", "сам(а) с собой", "здоровье", "деньги", "другое"];
const FEELINGS = ["тревога", "злость", "вина", "грусть", "растерянность", "стыд", "пустота"];

function redirectToLogin() {
  if (typeof window === "undefined") return;
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.href = `${loginUrl()}?next=${next}`;
}

function AngleCardPreview({ angle, index, active, onClick }: {
  angle: ReframeAngle;
  index: number;
  active: boolean;
  onClick: () => void;
}) {
  const style = ANGLE_STYLES[angle.id] ?? ANGLE_STYLES.thoughts;
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex flex-col rounded-[20px] p-6 text-left transition-all"
      style={{ background: style.bg, color: style.color, outline: active ? "2px solid var(--soft-bordeaux)" : "none", outlineOffset: 2, minHeight: 160 }}
    >
      <span className="absolute right-5 top-5" style={{ fontSize: 28, opacity: 0.55 }}>{ANGLE_GLYPHS[angle.id] ?? "·"}</span>
      <span className="text-xs font-semibold uppercase tracking-widest opacity-60">угол {String(index + 1).padStart(2, "0")}</span>
      <span className="mt-2 font-heading text-xl font-semibold leading-tight">{angle.title}</span>
      <span className="mt-1 text-sm italic opacity-80">{angle.subtitle}</span>
      <span className="mt-3 text-sm leading-relaxed opacity-75">{angle.facts[0] ?? ""}</span>
      <span className="mt-3 text-xs opacity-70">{active ? "открыто" : "читать"} →</span>
    </button>
  );
}

function AngleDetail({ angle, index, total, nextTitle, onPrev, onNext }: {
  angle: ReframeAngle;
  index: number;
  total: number;
  nextTitle?: string;
  onPrev: () => void;
  onNext: () => void;
}) {
  const style = ANGLE_STYLES[angle.id] ?? ANGLE_STYLES.thoughts;
  return (
    <div className="rounded-[20px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper)] p-6 sm:p-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full px-4 py-2 font-heading text-lg font-semibold" style={{ background: style.bg, color: style.color }}>
            <span aria-hidden="true">{ANGLE_GLYPHS[angle.id]}</span>
            {angle.title}
          </span>
          <span className="text-sm italic text-[var(--soft-ink-soft)]">{angle.subtitle}</span>
        </div>
        <span className="text-sm text-[var(--soft-ink-faint)]">{index + 1} / {total}</span>
      </div>

      <div className="mt-6 grid gap-8 sm:grid-cols-2">
        <div className="flex flex-col gap-6">
          <div>
            <p className="soft-eyebrow mb-3">что я вижу</p>
            <ul className="flex flex-col gap-2">
              {angle.facts.map((f, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-0.5 font-heading text-lg leading-none" style={{ color: "var(--soft-terracotta-dark)" }}>·</span>
                  <span className="text-[15px] leading-relaxed text-[var(--soft-ink)]">{f}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="soft-eyebrow mb-3">что стоит уточнить</p>
            <ul className="flex flex-col gap-2">
              {angle.unknowns.map((u, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-0.5 font-heading text-lg leading-none text-[var(--soft-lilac,#A89BC9)]">?</span>
                  <span className="text-[15px] leading-relaxed text-[var(--soft-ink-soft)]">{u}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div>
            <p className="soft-eyebrow mb-3">что можно сделать</p>
            <ul className="flex flex-col gap-2">
              {angle.options.map((o, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-1 text-[13px] text-[var(--soft-sage,#8A9E7E)]">↗</span>
                  <span className="text-[15px] leading-relaxed text-[var(--soft-ink)]">{o}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-[16px] bg-[var(--soft-paper-deep)] p-4">
            <p className="soft-eyebrow mb-2">вопрос к себе</p>
            <p className="font-heading text-[22px] italic leading-snug text-[var(--soft-bordeaux)]">«{angle.ask}»</p>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-[16px] border border-dashed border-[var(--soft-terracotta,#D6856A)] p-4" style={{ background: "linear-gradient(140deg, #FFFCF5, #F4D9C1)" }}>
        <div className="flex items-start gap-3">
          <span className="text-[22px] text-[var(--soft-terracotta-dark)]">✦</span>
          <div>
            <p className="soft-eyebrow mb-1" style={{ color: "var(--soft-terracotta-dark)" }}>следующий шаг</p>
            <p className="font-heading text-lg text-[var(--soft-bordeaux)]">{angle.step}</p>
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap justify-between gap-3">
        <Button onClick={onPrev} disabled={index === 0} className="soft-button soft-button-ghost">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Предыдущий угол
        </Button>
        {index < total - 1 && (
          <Button onClick={onNext} className="soft-button soft-button-primary">
            Следующий: {nextTitle}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function ReframeActions({ resultId }: { resultId?: string | null }) {
  const { status: authStatus } = useSession();
  const isAuthenticated = authStatus === "authenticated";

  const [sourceText, setSourceText] = useState("");
  const [topic, setTopic] = useState<string | null>(null);
  const [feeling, setFeeling] = useState<string | null>(null);
  const [result, setResult] = useState<ReframeResult | null>(null);
  const [hasEntitlement, setHasEntitlement] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [activeAngle, setActiveAngle] = useState(0);

  // Сессионность: открыть конкретный сохранённый разбор по ?resultId=.
  useEffect(() => {
    if (!resultId || authStatus !== "authenticated") return;
    let cancelled = false;
    jsonRequest<ApiPayload>(`/api/products/reframe?resultId=${encodeURIComponent(resultId)}`)
      .then((payload) => {
        if (cancelled) return;
        setHasEntitlement(Boolean(payload.hasEntitlement));
        setResult(payload.results?.[0] ?? null);
        setActiveAngle(0);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [authStatus, resultId]);

  function contextNote(): string | undefined {
    const parts = [topic ? `О чём: ${topic}` : "", feeling ? `Что сильнее: ${feeling}` : ""].filter(Boolean);
    return parts.length ? parts.join("\n") : undefined;
  }

  async function createPreview() {
    if (!isAuthenticated) {
      redirectToLogin();
      return;
    }
    if (sourceText.trim().length < 10) {
      setMessage("Опишите ситуацию хотя бы парой предложений — так переосмысление будет точнее.");
      setStatus("error");
      return;
    }
    setStatus("loading");
    setMessage(null);
    try {
      const payload = await jsonRequest<ApiPayload>("/api/products/reframe", {
        method: "POST",
        body: JSON.stringify({ action: "preview", sourceText: sourceText.trim().slice(0, 6000), contextNote: contextNote() }),
      });
      setHasEntitlement(Boolean(payload.hasEntitlement));
      setResult(payload.result ?? null);
      setActiveAngle(0);
      setStatus("idle");
    } catch (error) {
      const typed = error as Error & { status?: number };
      if (typed.status === 401) return redirectToLogin();
      setMessage(typed.message || "Не удалось собрать предпросмотр");
      setStatus("error");
    }
  }

  async function generateReport() {
    if (!result?.id) return;
    setStatus("loading");
    setMessage(null);
    try {
      const payload = await jsonRequest<ApiPayload>("/api/products/reframe", {
        method: "POST",
        body: JSON.stringify({ action: "generate", id: result.id }),
      });
      setHasEntitlement(Boolean(payload.hasEntitlement));
      setResult(payload.result ?? null);
      setActiveAngle(0);
      setStatus("idle");
    } catch (error) {
      const typed = error as Error & { status?: number };
      if (typed.status === 402) {
        setMessage("Откройте полное переосмысление баллами или картой — результат появится здесь же.");
        setStatus("error");
        return;
      }
      if (typed.status === 401) return redirectToLogin();
      setMessage(typed.message || "Не удалось открыть переосмысление");
      setStatus("error");
    }
  }

  function startNew() {
    setResult(null);
    setHasEntitlement(false);
    setSourceText("");
    setTopic(null);
    setFeeling(null);
    setActiveAngle(0);
    setMessage(null);
    setStatus("idle");
  }

  const parsed = result?.resultText ? tryParseReframe(result.resultText) : null;
  const angles = parsed?.angles ?? [];
  const recommendation = getNextStepRecommendation("reframe", { contact: topic, emotion: feeling });

  // ── Result view: 4 lenses + funnel ──────────────────────────────────────
  if (angles.length > 0) {
    return (
      <div className="soft-card soft-form-panel mt-8" data-testid="reframe-actions">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="soft-eyebrow">когнитивный рефрейминг</p>
            <h2 className="soft-h3 mt-2">Ваша ситуация под четырьмя углами</h2>
          </div>
          <span className="soft-badge soft-badge-warm">готово</span>
        </div>

        {message && <p className="mt-4 rounded-2xl bg-[var(--soft-paper-deep)] p-3 text-sm text-[var(--soft-bordeaux)]">{message}</p>}

        <div className="mt-6 grid grid-cols-2 gap-4">
          {angles.map((angle, i) => (
            <AngleCardPreview key={angle.id} angle={angle} index={i} active={i === activeAngle} onClick={() => setActiveAngle(i)} />
          ))}
        </div>
        <div className="mt-4">
          <AngleDetail
            key={activeAngle}
            angle={angles[activeAngle]}
            index={activeAngle}
            total={angles.length}
            nextTitle={angles[activeAngle + 1]?.title}
            onPrev={() => setActiveAngle((v) => Math.max(0, v - 1))}
            onNext={() => setActiveAngle((v) => Math.min(angles.length - 1, v + 1))}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <a href={`/products/print/${result?.id}`} target="_blank" rel="noopener noreferrer" className="soft-button soft-button-ghost">
            <Download className="size-4" aria-hidden="true" />
            Скачать PDF
          </a>
        </div>

        <div className="mt-4">
          <NextStepCard rec={recommendation} onStartNew={startNew} loading={status === "loading"} testIdPrefix="reframe" />
        </div>

        <p className="mt-3 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 text-center text-xs text-[var(--soft-ink-faint)]">
          <BookOpen className="size-3.5" aria-hidden="true" />
          <span>Переосмысление сохранено в</span>
          <Link href={appUrl("/diary")} className="font-medium text-[var(--soft-ink-soft)] underline-offset-2 hover:underline">дневнике</Link>
          <span>— там его можно перечитать или удалить.</span>
        </p>
      </div>
    );
  }

  // ── Intake + free preview view ──────────────────────────────────────────
  return (
    <div className="soft-card soft-form-panel mt-8" data-testid="reframe-actions">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="soft-eyebrow">когнитивный рефрейминг</p>
          <h2 className="soft-h3 mt-2">Посмотреть на ситуацию иначе</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Опишите, что не отпускает. Метод рефрейминга разложит это на мысли, чувства, другой взгляд и шаг.
          </p>
        </div>
        <span className={hasEntitlement ? "soft-badge soft-badge-warm" : "soft-badge"}>
          {hasEntitlement ? "доступ открыт" : "первый угол бесплатно"}
        </span>
      </div>

      {message && <p className="mt-4 rounded-2xl bg-[var(--soft-paper-deep)] p-3 text-sm text-[var(--soft-bordeaux)]">{message}</p>}

      <div className="mt-5 soft-card-flat p-5">
        <label className="soft-eyebrow" htmlFor="reframe-input">ситуация или мысль, которая не отпускает</label>
        <textarea
          id="reframe-input"
          value={sourceText}
          onChange={(e) => setSourceText(e.target.value.slice(0, 6000))}
          placeholder="Например: руководитель раскритиковал мою работу при всех, и я не могу перестать прокручивать это в голове и думать, что меня скоро уволят."
          rows={5}
          className="soft-question-input mt-3"
          disabled={status === "loading"}
          data-testid="reframe-input"
        />

        <div className="mt-4">
          <p className="text-[13px] font-medium text-[var(--soft-ink-soft)]">О чём это? <span className="text-[var(--soft-ink-faint)]">— по желанию</span></p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {TOPICS.map((t) => (
              <button key={t} type="button" onClick={() => setTopic(topic === t ? null : t)}
                className={`rounded-full px-2.5 py-1 text-[12.5px] transition ${topic === t ? "bg-[var(--soft-bordeaux)] text-[#FBF0E1]" : "bg-[var(--soft-paper-deep)] text-[var(--soft-ink-soft)] hover:bg-[var(--soft-paper-edge)]"}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3">
          <p className="text-[13px] font-medium text-[var(--soft-ink-soft)]">Что сейчас сильнее всего? <span className="text-[var(--soft-ink-faint)]">— по желанию</span></p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {FEELINGS.map((f) => (
              <button key={f} type="button" onClick={() => setFeeling(feeling === f ? null : f)}
                className={`rounded-full px-2.5 py-1 text-[12.5px] transition ${feeling === f ? "bg-[var(--soft-bordeaux)] text-[#FBF0E1]" : "bg-[var(--soft-paper-deep)] text-[var(--soft-ink-soft)] hover:bg-[var(--soft-paper-edge)]"}`}>
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Free preview (first lens teaser) */}
      {result?.previewText && (
        <div className="mt-4 rounded-[18px] px-5 py-4" style={{ background: "var(--soft-paper-warm)" }}>
          <p className="soft-eyebrow text-[var(--soft-terracotta-dark)]">первый угол — бесплатно</p>
          <div className="mt-1.5 text-[14px] leading-relaxed text-[var(--soft-ink)] [&_p]:m-0 [&_ul]:my-1 [&_ul]:pl-4 [&_li]:my-0">
            <SoftMarkdown content={result.previewText} />
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        {hasEntitlement ? (
          <Button onClick={generateReport} disabled={status === "loading"} className="soft-button soft-button-primary">
            <LockKeyhole className="size-4" aria-hidden="true" />
            {result ? "Открыть все четыре угла" : "Переосмыслить ситуацию"}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        ) : result ? (
          <ProductPurchaseControls
            productKey="reframe"
            label="Открыть полное переосмысление"
            checkoutSource="reframe-generate"
            creditCost={1}
            onUnlocked={() => { setHasEntitlement(true); void generateReport(); }}
          />
        ) : (
          <Button onClick={createPreview} disabled={status === "loading"} className="soft-button soft-button-primary" data-testid="reframe-start">
            {status === "loading" ? "Собираем первый угол…" : "Посмотреть иначе"}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        )}
        {result && !hasEntitlement && (
          <button type="button" onClick={startNew} disabled={status === "loading"}
            className="inline-flex items-center gap-1.5 self-center text-sm font-medium text-[var(--soft-ink-soft)] underline underline-offset-4 disabled:opacity-50">
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Другая ситуация
          </button>
        )}
      </div>
    </div>
  );
}
