"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowRight, BookOpen, Compass, Download, LockKeyhole, MessageSquareText, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SoftMarkdown } from "@/components/ui/soft-markdown";
import { FullQuestionBundleOffer } from "@/components/products/full-question-bundle-offer";
import { ProductPurchaseControls } from "@/components/products/product-purchase-controls";
import { ServiceTriage, type TriagePrimary, type TriageProduct } from "@/components/products/service-triage";
import { dialogueTopicFromChip, recommendPrimaryProductExcluding, recommendSecondaryProducts } from "@/lib/product-format-recommendations";
import { pointsWord } from "@/lib/points";
import { appUrl, loginUrl } from "@/lib/subdomain";

// B442 (M28): «Подробный разбор» — самодостаточная услуга (клиническая формулировка
// случая «5 P» + problem-solving). Контекст собирается ВНУТРИ услуги (textarea +
// чипы), без первичного диалога. Один экран; платный документ 6–10 стр.; автосейв
// в Дневник; сессионность; PDF.

// Client-safe копия оглавления (lib/deep-report.ts — server-only, импортировать
// нельзя). Должна совпадать с DEEP_REPORT_SECTIONS в lib/deep-report.ts.
const TOC_LABELS = [
  "Что происходит",
  "Как это могло сложиться",
  "Что удерживает",
  "На что можно опереться",
  "Развилки и сценарии",
  "Маршрут небольших шагов",
  "Бережное резюме и с кем продолжить",
];

const TOPICS = ["работа", "отношения", "семья", "сам(а) с собой", "здоровье", "деньги", "другое"];
const GOALS = ["понять причины", "принять решение", "снизить тревогу", "подготовиться к разговору"];

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

function redirectToLogin() {
  if (typeof window === "undefined") return;
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.href = `${loginUrl()}?next=${next}`;
}

function TocList({ revealedCount }: { revealedCount: number }) {
  return (
    <div className="flex flex-col">
      {TOC_LABELS.map((t, i) => (
        <div
          key={i}
          className="flex gap-3 py-2"
          style={{ borderTop: i ? "1px solid var(--soft-paper-edge)" : "none", opacity: i < revealedCount ? 1 : 0.5 }}
        >
          <span className="w-6 shrink-0 font-heading text-sm italic" style={{ color: "var(--soft-terracotta-dark)" }}>
            {String(i + 1).padStart(2, "0")}
          </span>
          <span className="text-sm text-[var(--soft-ink)]">{t}</span>
        </div>
      ))}
    </div>
  );
}

export function DeepReportActions({ resultId }: { resultId?: string | null }) {
  const { status: authStatus } = useSession();
  const isAuthenticated = authStatus === "authenticated";

  const [sourceText, setSourceText] = useState("");
  const [topic, setTopic] = useState<string | null>(null);
  const [goal, setGoal] = useState<string | null>(null);
  const [result, setResult] = useState<DeepReportResult | null>(null);
  const [hasEntitlement, setHasEntitlement] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  // Сессионность: открыть конкретный сохранённый разбор по ?resultId=.
  useEffect(() => {
    if (!resultId || authStatus !== "authenticated") return;
    let cancelled = false;
    jsonRequest<ApiPayload>(`/api/products/deep-report?resultId=${encodeURIComponent(resultId)}`)
      .then((payload) => {
        if (cancelled) return;
        setHasEntitlement(Boolean(payload.hasEntitlement));
        setResult(payload.results?.[0] ?? null);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [authStatus, resultId]);

  function contextNote(): string | undefined {
    const parts = [topic ? `О чём: ${topic}` : "", goal ? `Цель разбора: ${goal}` : ""].filter(Boolean);
    return parts.length ? parts.join("\n") : undefined;
  }

  async function createPreview() {
    if (!isAuthenticated) return redirectToLogin();
    if (sourceText.trim().length < 10) {
      setMessage("Опишите ситуацию подробнее — для глубокого разбора важны детали.");
      setStatus("error");
      return;
    }
    setStatus("loading");
    setMessage(null);
    try {
      const payload = await jsonRequest<ApiPayload>("/api/products/deep-report", {
        method: "POST",
        body: JSON.stringify({ action: "preview", sourceText: sourceText.trim().slice(0, 8000), contextNote: contextNote() }),
      });
      setHasEntitlement(Boolean(payload.hasEntitlement));
      setResult(payload.result ?? null);
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
      const payload = await jsonRequest<ApiPayload>("/api/products/deep-report", {
        method: "POST",
        body: JSON.stringify({ action: "generate", id: result.id }),
      });
      setHasEntitlement(Boolean(payload.hasEntitlement));
      setResult(payload.result ?? null);
      setStatus("idle");
    } catch (error) {
      const typed = error as Error & { status?: number };
      if (typed.status === 402) {
        setMessage("Откройте полный разбор баллами или картой — документ появится здесь же.");
        setStatus("error");
        return;
      }
      if (typed.status === 401) return redirectToLogin();
      setMessage(typed.message || "Не удалось создать разбор");
      setStatus("error");
    }
  }

  function startNew() {
    setResult(null);
    setHasEntitlement(false);
    setSourceText("");
    setTopic(null);
    setGoal(null);
    setMessage(null);
    setStatus("idle");
  }

  // B443: единая воронка «что вам подойдет» (как chat-analysis/tarot) — рекомендация
  // по теме из чипа + продолжить в живом чате; «другие форматы» + специалист идут
  // ниже внутри ServiceTriage. deep-report никогда не рекомендует сам себя.
  const topicKey = dialogueTopicFromChip(topic);
  const primaryRec = recommendPrimaryProductExcluding(topicKey, "deep-report");
  const triagePrimary: TriagePrimary[] = [
    {
      key: primaryRec.slug,
      testId: "deep-report-next-step",
      ribbon: "подобрано для вас",
      icon: Compass,
      title: primaryRec.name,
      description: primaryRec.reason,
      priceMain: primaryRec.price,
      priceSub: primaryRec.creditCost != null ? `или ${primaryRec.creditCost} ${pointsWord(primaryRec.creditCost)}` : null,
      ctaLabel: "Открыть",
      href: primaryRec.href,
    },
    {
      key: "chat",
      testId: "deep-report-continue-chat",
      ribbon: "продолжить в диалоге",
      icon: MessageSquareText,
      title: "Продолжить разговор в чате",
      description: "Живой диалог в своём темпе — 45 минут, чтобы разобрать ситуацию глубже.",
      priceMain: "790 ₽",
      priceSub: "45 мин · или 4 балла",
      ctaLabel: "Начать",
      href: "/products/chat",
    },
  ];
  const triageSecondary: TriageProduct[] = recommendSecondaryProducts(topicKey, primaryRec.slug, 4)
    .filter((item) => item.slug !== "deep-report")
    .slice(0, 3)
    .map((item) => ({ slug: item.slug, name: item.name, href: item.href, price: item.price, creditCost: item.creditCost }));

  // ── Result view: TOC sidebar + document ─────────────────────────────────
  if (result?.resultText) {
    return (
      <div className="soft-card soft-form-panel mt-8" data-testid="deep-report-actions">
        {message && <p className="mb-5 rounded-2xl bg-[var(--soft-paper-deep)] p-3 text-sm text-[var(--soft-bordeaux)]">{message}</p>}

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <div className="soft-card-flat rounded-[16px] p-5 lg:sticky lg:top-[84px] lg:self-start">
            <p className="soft-eyebrow mb-3">оглавление</p>
            <TocList revealedCount={TOC_LABELS.length} />
            <a href={`/products/print/${result.id}`} target="_blank" rel="noopener noreferrer" className="soft-button soft-button-ghost mt-5 w-full justify-center text-xs">
              <Download className="size-4" aria-hidden="true" />
              Скачать PDF
            </a>
          </div>

          <div>
            <article
              className="soft-card rounded-[16px] p-6 font-heading text-[1.05rem] leading-relaxed text-[var(--soft-ink)]"
              style={{ background: "linear-gradient(160deg, #FFFCF5, #F4D9C1 200%)" }}
            >
              <p className="soft-eyebrow mb-2">{result.title}</p>
              <SoftMarkdown content={result.resultText} />
            </article>

            <ServiceTriage
              eyebrow="что вам подойдет"
              testId="deep-report-triage"
              primary={triagePrimary}
              secondary={triageSecondary}
              specialistHref="/practitioners"
            />
            <button
              type="button"
              onClick={startNew}
              disabled={status === "loading"}
              data-testid="deep-report-start-new"
              className="mt-3 inline-flex items-center justify-center gap-2 rounded-full border border-[var(--soft-paper-edge)] px-5 py-2.5 text-sm font-medium text-[var(--soft-ink-soft)] transition hover:bg-[var(--soft-paper-card)] disabled:opacity-50"
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              Начать новый разбор
            </button>

            <p className="mt-3 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 text-center text-xs text-[var(--soft-ink-faint)]">
              <BookOpen className="size-3.5" aria-hidden="true" />
              <span>Разбор сохранён в</span>
              <Link href={appUrl("/diary")} className="font-medium text-[var(--soft-ink-soft)] underline-offset-2 hover:underline">дневнике</Link>
              <span>— там его можно перечитать или удалить.</span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Intake + free preview view ──────────────────────────────────────────
  return (
    <div className="soft-card soft-form-panel mt-8" data-testid="deep-report-actions">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="soft-eyebrow">структурный разбор · 6–10 страниц</p>
          <h2 className="soft-h3 mt-2">Подробный разбор ситуации</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Полноценный документ по методу клинической формулировки: что происходит, что удерживает, на что опереться и маршрут шагов.
          </p>
        </div>
        <span className={hasEntitlement ? "soft-badge soft-badge-warm" : "soft-badge"}>
          {hasEntitlement ? "доступ открыт" : "оглавление + первый блок бесплатно"}
        </span>
      </div>

      {message && <p className="mt-4 rounded-2xl bg-[var(--soft-paper-deep)] p-3 text-sm text-[var(--soft-bordeaux)]">{message}</p>}

      <div className="mt-5 soft-card-flat p-5">
        <label className="soft-eyebrow" htmlFor="deep-report-input">опишите ситуацию подробно</label>
        <textarea
          id="deep-report-input"
          value={sourceText}
          onChange={(e) => setSourceText(e.target.value.slice(0, 8000))}
          placeholder="Что происходит, как давно, что вы уже пробовали и в чём сейчас главный вопрос. Чем больше деталей — тем точнее разбор."
          rows={6}
          className="soft-question-input mt-3"
          disabled={status === "loading"}
          data-testid="deep-report-input"
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
          <p className="text-[13px] font-medium text-[var(--soft-ink-soft)]">Что хотите получить? <span className="text-[var(--soft-ink-faint)]">— по желанию</span></p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {GOALS.map((g) => (
              <button key={g} type="button" onClick={() => setGoal(goal === g ? null : g)}
                className={`rounded-full px-2.5 py-1 text-[12.5px] transition ${goal === g ? "bg-[var(--soft-bordeaux)] text-[#FBF0E1]" : "bg-[var(--soft-paper-deep)] text-[var(--soft-ink-soft)] hover:bg-[var(--soft-paper-edge)]"}`}>
                {g}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* TOC preview — what the full document covers */}
      <div className="mt-4 rounded-[16px] p-5" style={{ background: "linear-gradient(160deg, #FFFCF5, #F4D9C1)" }}>
        <p className="soft-eyebrow mb-3">оглавление полного разбора</p>
        <TocList revealedCount={result ? 1 : 0} />
      </div>

      {/* Free first block (teaser) */}
      {result?.previewText && (
        <div className="mt-4 rounded-[16px] bg-[var(--soft-paper-deep)] p-4 text-sm leading-relaxed text-[var(--soft-ink-soft)] [&_h2]:mt-0 [&_h2]:text-base">
          <SoftMarkdown content={result.previewText} />
        </div>
      )}

      {!hasEntitlement && result && (
        <FullQuestionBundleOffer onUnlocked={() => { setHasEntitlement(true); }} />
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        {hasEntitlement ? (
          <Button onClick={generateReport} disabled={status === "loading"} className="soft-button soft-button-primary">
            <LockKeyhole className="size-4" aria-hidden="true" />
            {result ? "Получить полный разбор" : "Сформировать разбор"}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        ) : result ? (
          <ProductPurchaseControls
            productKey="deep-report"
            label="Открыть полный разбор"
            checkoutSource="deep-report-generate"
            creditCost={3}
            onUnlocked={() => { setHasEntitlement(true); void generateReport(); }}
          />
        ) : (
          <Button onClick={createPreview} disabled={status === "loading"} className="soft-button soft-button-primary" data-testid="deep-report-start">
            {status === "loading" ? "Собираем оглавление…" : "Начать разбор"}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
}
