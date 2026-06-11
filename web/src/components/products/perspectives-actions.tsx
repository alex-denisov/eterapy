"use client";

import React, { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { ArrowLeft, ArrowRight, Bookmark, Download, LockKeyhole, Save, Share2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductIntake } from "@/components/products/product-intake";
import { ProductPurchaseControls } from "@/components/products/product-purchase-controls";
import { SoftMarkdown } from "@/components/ui/soft-markdown";

type PerspectiveAngle = {
  id: string;
  title: string;
  subtitle: string;
  facts: string[];
  unknowns: string[];
  options: string[];
  ask: string;
  step: string;
};

function tryParsePerspectives(text: string): { angles: PerspectiveAngle[] } | null {
  if (!text) return null;
  try {
    const raw = JSON.parse(text) as { angles?: unknown };
    if (!Array.isArray(raw.angles) || raw.angles.length < 4) return null;
    return raw as { angles: PerspectiveAngle[] };
  } catch {
    return null;
  }
}

type PerspectivesResult = {
  id: string;
  status: string;
  title: string;
  previewText: string | null;
  resultText: string | null;
  saved: boolean;
};

type ApiPayload = {
  hasEntitlement?: boolean;
  result?: PerspectivesResult;
  results?: PerspectivesResult[];
  checkout?: { productKey: string; checkoutSource: string };
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

const ANGLE_STYLES: Record<string, { bg: string; color: string; glyphColor: string }> = {
  mind:    { bg: "linear-gradient(140deg, #F4D9C1, #F8E6D1)", color: "#5C2A2C", glyphColor: "#5C2A2C" },
  feeling: { bg: "linear-gradient(140deg, #E8C4B8, #F4D5C8)", color: "#5C2A2C", glyphColor: "#5C2A2C" },
  symbol:  { bg: "linear-gradient(140deg, #DBD3EA, #E8E1F2)", color: "#4A3E5E", glyphColor: "#4A3E5E" },
  action:  { bg: "linear-gradient(140deg, #D6DECC, #E5EBDC)", color: "#3A4A36", glyphColor: "#3A4A36" },
};

const ANGLE_GLYPHS: Record<string, string> = {
  mind: "⚙",
  feeling: "♡",
  symbol: "◑",
  action: "↗",
};

function AngleCardPreview({
  angle,
  index,
  active,
  onClick,
}: {
  angle: PerspectiveAngle;
  index: number;
  active: boolean;
  onClick: () => void;
}) {
  const style = ANGLE_STYLES[angle.id] ?? ANGLE_STYLES.mind;
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex flex-col rounded-[20px] p-6 text-left transition-all"
      style={{
        background: style.bg,
        color: style.color,
        outline: active ? `2px solid var(--soft-bordeaux)` : "none",
        outlineOffset: 2,
        minHeight: 160,
      }}
    >
      <span className="absolute right-5 top-5" style={{ fontSize: 28, opacity: 0.55 }}>
        {ANGLE_GLYPHS[angle.id] ?? "·"}
      </span>
      <span className="text-xs font-semibold uppercase tracking-widest opacity-60">
        часть {String(index + 1).padStart(2, "0")}
      </span>
      <span className="mt-2 font-heading text-xl font-semibold leading-tight">{angle.title}</span>
      <span className="mt-1 text-sm italic opacity-80">{angle.subtitle}</span>
      <span className="mt-3 text-sm leading-relaxed opacity-75">{angle.facts[0] ?? ""}</span>
      <span className="mt-3 text-xs opacity-70">{active ? "открыто" : "читать"} →</span>
    </button>
  );
}

function AngleDetail({ angle, index, total, nextTitle, onPrev, onNext, onSave }: {
  angle: PerspectiveAngle;
  index: number;
  total: number;
  nextTitle?: string;
  onPrev: () => void;
  onNext: () => void;
  onSave: () => void;
}) {
  const style = ANGLE_STYLES[angle.id] ?? ANGLE_STYLES.mind;
  return (
    <div className="rounded-[20px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper)] p-6 sm:p-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 font-heading text-lg font-semibold"
            style={{ background: style.bg, color: style.color }}
          >
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
            <p className="soft-eyebrow mb-3">что пока неизвестно</p>
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
            <p className="font-heading text-[22px] italic leading-snug text-[var(--soft-bordeaux)]">
              «{angle.ask}»
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-[16px] border border-dashed border-[var(--soft-terracotta,#D6856A)] p-4"
        style={{ background: "linear-gradient(140deg, #FFFCF5, #F4D9C1)" }}>
        <div className="flex items-start gap-3">
          <span className="text-[22px] text-[var(--soft-terracotta-dark)]">✦</span>
          <div>
            <p className="soft-eyebrow mb-1" style={{ color: "var(--soft-terracotta-dark)" }}>следующий шаг</p>
            <p className="font-heading text-lg text-[var(--soft-bordeaux)]">{angle.step}</p>
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap justify-between gap-3">
        <Button
          onClick={onPrev}
          disabled={index === 0}
          className="soft-button soft-button-ghost"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Предыдущая часть
        </Button>
        {index < total - 1 ? (
          <Button onClick={onNext} className="soft-button soft-button-primary">
            Следующий: {nextTitle}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        ) : (
          <Button onClick={onSave} className="soft-button soft-button-primary">
            <Bookmark className="size-4" aria-hidden="true" />
            Сохранить в Мою карту
          </Button>
        )}
      </div>
    </div>
  );
}

export function PerspectivesActions({ dialogueId }: { dialogueId?: string | null }) {
  const { status: authStatus } = useSession();
  const [result, setResult] = useState<PerspectivesResult | null>(null);
  const [hasEntitlement, setHasEntitlement] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "paying" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [activeAngle, setActiveAngle] = useState(0);
  const isAuthenticated = authStatus === "authenticated";

  useEffect(() => {
    if (!dialogueId || authStatus !== "authenticated") return;
    let cancelled = false;
    jsonRequest<ApiPayload>(`/api/products/perspectives?dialogueId=${encodeURIComponent(dialogueId)}`)
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
      setMessage("Войдите, чтобы получить бесплатную часть разбора и сохранить её в кабинете.");
      setStatus("error");
      return;
    }
    setStatus("loading");
    setMessage(null);
    try {
      const payload = await jsonRequest<ApiPayload>("/api/products/perspectives", {
        method: "POST",
        body: JSON.stringify({ dialogueId, action: "preview" }),
      });
      setHasEntitlement(Boolean(payload.hasEntitlement));
      setResult(payload.result ?? null);
      setActiveAngle(0);
      setStatus("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось получить бесплатную часть разбора");
      setStatus("error");
    }
  }

  async function generateReport() {
    if (!dialogueId) return;
    if (!isAuthenticated) {
      setMessage("Войдите, чтобы открыть полную картину баллами или картой.");
      setStatus("error");
      return;
    }
    setStatus("loading");
    setMessage(null);
    try {
      const payload = await jsonRequest<ApiPayload>("/api/products/perspectives", {
        method: "POST",
        body: JSON.stringify({ dialogueId, action: "generate" }),
      });
      setHasEntitlement(Boolean(payload.hasEntitlement));
      setResult(payload.result ?? null);
      setActiveAngle(0);
      setStatus("idle");
    } catch (error) {
      const typed = error as Error & { status?: number };
      if (typed.status === 402) {
        setMessage("Откройте полную картину баллами или картой — после этого результат появится здесь же.");
        setStatus("error");
        return;
      }
      setMessage(typed.message || "Не удалось получить полную картину");
      setStatus("error");
    }
  }

  async function saveReport() {
    if (!result) return;
    setStatus("loading");
    try {
      const payload = await jsonRequest<ApiPayload>(`/api/products/perspectives/${result.id}`, {
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

  async function deleteReport() {
    if (!result) return;
    setStatus("loading");
    try {
      await jsonRequest(`/api/products/perspectives/${result.id}`, { method: "DELETE" });
      setResult(null);
      setStatus("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось удалить результат");
      setStatus("error");
    }
  }

  if (!dialogueId) {
    return (
      <ProductIntake
        productKey="perspectives"
        mode="full"
        title="Соберём контекст для полной картины"
        description="Короткий сбор контекста останется внутри услуги и откроет полную картину на этой же странице, без перехода в общий первичный разбор."
        submitLabel="Начать с вопроса"
        readyLabel="Контекст готов. Возвращаем вас к полной картине."
        testId="perspectives-no-dialogue"
      />
    );
  }

  const parsed = result?.resultText ? tryParsePerspectives(result.resultText) : null;
  const angles = parsed?.angles ?? [];

  return (
    <div className="soft-card soft-form-panel mt-8" data-testid="perspectives-actions">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="soft-eyebrow">углубление</p>
          <h2 className="soft-h3 mt-2">
            Полная картина <em className="not-italic italic">одного</em> ответа
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Разные углы зрения на одну и ту же ситуацию. Можно читать в любом порядке.
          </p>
        </div>
        <span className={hasEntitlement ? "soft-badge soft-badge-warm" : "soft-badge"}>
          {hasEntitlement ? "доступ открыт" : "первая часть бесплатно"}
        </span>
      </div>

      {message && (
        <p className="mt-4 rounded-2xl bg-[var(--soft-paper-deep)] p-3 text-sm text-[var(--soft-bordeaux)]">
          {message}
        </p>
      )}

      {/* preview text */}
      {result?.previewText && !angles.length && (
        <SoftMarkdown
          content={result.previewText}
          className="soft-card-flat mt-5 p-4 text-sm text-[var(--soft-ink-soft)]"
        />
      )}

      {/* angles grid */}
      {angles.length > 0 && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4">
            {angles.map((angle, i) => (
              <AngleCardPreview
                key={angle.id}
                angle={angle}
                index={i}
                active={i === activeAngle}
                onClick={() => setActiveAngle(i)}
              />
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
              onSave={saveReport}
            />
          </div>
        </>
      )}

      {/* actions */}
      <div className="mt-6 flex flex-wrap gap-3">
        {/* #7: paid order is the single primary action (credits → полная картина in
            one click); the free first part is a quiet secondary link. The old
            always-disabled buy button is gone for non-buyers. */}
        {hasEntitlement ? (
          <Button
            onClick={generateReport}
            disabled={status === "loading" || status === "paying"}
            className="soft-button soft-button-primary"
          >
            <LockKeyhole className="size-4" aria-hidden="true" />
            {angles.length ? "Обновить картину" : "Увидеть полную картину"}
          </Button>
        ) : (
          <>
            <ProductPurchaseControls
              productKey="perspectives"
              label="Открыть полную картину"
              checkoutSource="perspectives-generate"
              creditCost={1}
              onUnlocked={() => {
                setHasEntitlement(true);
                void generateReport();
              }}
            />
            {!result?.previewText && angles.length === 0 && (
              <button
                type="button"
                onClick={createPreview}
                disabled={status === "loading"}
                className="self-start text-sm font-medium text-[var(--soft-bordeaux)] underline underline-offset-4 disabled:opacity-50"
                data-testid="perspectives-free-fragment"
              >
                Сначала бесплатная часть
              </button>
            )}
          </>
        )}
        {angles.length > 0 && (
          <>
            <Button onClick={saveReport} disabled={status === "loading" || result?.saved} className="soft-button soft-button-ghost">
              <Save className="size-4" aria-hidden="true" />
              {result?.saved ? "Сохранено" : "Сохранить в Мою карту"}
            </Button>
            <a href={`/api/products/perspectives/${result?.id}/export`} className="soft-button soft-button-ghost">
              <Download className="size-4" aria-hidden="true" />
              Экспорт
            </a>
            {/* B311: real share — Web Share API where available (mobile),
                clipboard fallback elsewhere. The share-card backend is not
                yet built; this links to the public product page with the
                dialogueId so a recipient lands on the same 4-angles UX. */}
            <Button
              onClick={async () => {
                if (!result?.id) return;
                const shareUrl = `${window.location.origin}/products/perspectives?dialogueId=${encodeURIComponent(result.id)}`;
                const shareText = "Полная картина — ETerapy";
                if (typeof navigator.share === "function") {
                  try {
                    await navigator.share({ title: shareText, url: shareUrl });
                    return;
                  } catch {
                    // user cancelled — fall through to clipboard
                  }
                }
                try {
                  await navigator.clipboard.writeText(shareUrl);
                  setMessage("Ссылка скопирована в буфер обмена.");
                  setStatus("error");
                } catch {
                  setMessage("Не удалось скопировать — скопируйте URL вручную из адресной строки.");
                  setStatus("error");
                }
              }}
              className="soft-button soft-button-ghost"
              data-testid="perspectives-share"
            >
              <Share2 className="size-4" aria-hidden="true" />
              Поделиться
            </Button>
            <Button onClick={deleteReport} disabled={status === "loading"} className="soft-button soft-button-ghost">
              <Trash2 className="size-4" aria-hidden="true" />
              Удалить
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
