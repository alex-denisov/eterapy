"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductPurchaseControls } from "@/components/products/product-purchase-controls";
import { OptionScrollStrip, OptionChoice } from "@/components/products/option-scroll-strip";
import { SymbolicResultScaffold } from "@/components/products/symbolic-result-scaffold";
import { SynastryWheel } from "@/components/products/esoteric-chart-visuals";
import { redirectToLogin, readingIdFromUrl, type SymbolicResult } from "@/components/products/use-symbolic-service";
import { useInputDraft } from "@/lib/use-input-draft";
import type { SynastryWheel as SynastryWheelData } from "@/lib/esoteric-chart";

// B451: «Совместимость по звёздам» — самодостаточная парная услуга по паттерну
// Таро/reframe (свой роут /api/products/synastry, двое участников). Колесо пары
// считается детерминированно; нет бесплатного фрагмента; автосейв; сессии по ?reading=.

export type SynastryResult = SymbolicResult;

type ApiPayload = {
  hasEntitlement?: boolean;
  result?: SymbolicResult;
  results?: SymbolicResult[];
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

const TOPICS = ["сближение", "доверие", "ссоры", "будущее", "быт", "кризис"];

const EXAMPLES_BY_TOPIC: Record<string, string[]> = {
  "сближение": ["Почему нам то тепло, то снова дистанция?"],
  "доверие": ["Как нам вернуть доверие после трудного периода?"],
  "ссоры": ["Почему мы часто ссоримся перед важными решениями?"],
  "будущее": ["Куда мы движемся как пара и совпадают ли наши ритмы?"],
  "быт": ["Как нам делить быт и не копить раздражение?"],
  "кризис": ["Мы в кризисе — что нам помогает услышать друг друга?"],
};
const EXAMPLES_DEFAULT = [
  "Например: почему мы часто ссоримся перед важными решениями?",
  "Опишите, что хотите понять как пара — разбор свяжет карты с вашим вопросом.",
];
function examplesForTopic(topic: string | null): string[] {
  return (topic && EXAMPLES_BY_TOPIC[topic]) || EXAMPLES_DEFAULT;
}

function extractSynastryWheel(result: SymbolicResult | null): SynastryWheelData | null {
  const md = result?.metadata;
  if (!md || typeof md !== "object") return null;
  const meta = md as Record<string, unknown>;
  const nested = (meta.generationMetadata ?? meta.previewGenerationMetadata) as Record<string, unknown> | undefined;
  const raw = (nested?.wheel ?? meta.wheel) as unknown;
  if (!raw || typeof raw !== "object") return null;
  if ((raw as { kind?: unknown }).kind !== "synastry") return null;
  return raw as SynastryWheelData;
}

function SynastryVisual({ result }: { result: SymbolicResult }) {
  const wheel = extractSynastryWheel(result);
  if (!wheel) return null;
  return (
    <div>
      <SynastryWheel wheel={wheel} />
      <div className="mt-3 grid grid-cols-2 gap-2.5" data-testid="synastry-facts">
        <div className="rounded-[12px] bg-[var(--soft-paper-deep)] px-3 py-2">
          <p className="soft-eyebrow text-[0.6rem]">солнце · первый</p>
          <p className="mt-0.5 text-[0.95rem] text-[var(--soft-ink)]">{wheel.a.sunSign.name}</p>
        </div>
        <div className="rounded-[12px] bg-[var(--soft-paper-deep)] px-3 py-2">
          <p className="soft-eyebrow text-[0.6rem]">солнце · второй</p>
          <p className="mt-0.5 text-[0.95rem] text-[var(--soft-ink)]">{wheel.b.sunSign.name}</p>
        </div>
      </div>
    </div>
  );
}

function SynastryTeaser() {
  return (
    <div className="rounded-[16px] border border-dashed border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4 text-center" data-testid="synastry-teaser" aria-hidden="true">
      <svg viewBox="0 0 200 120" className="mx-auto block w-[180px]">
        <circle cx="74" cy="60" r="42" fill="none" stroke="var(--soft-paper-edge)" strokeWidth="1.4" strokeDasharray="3 5" />
        <circle cx="126" cy="60" r="42" fill="none" stroke="var(--soft-paper-edge)" strokeWidth="1.4" strokeDasharray="3 5" />
        <text x="100" y="60" textAnchor="middle" dominantBaseline="central" fontSize="22" fill="var(--soft-ink-faint)">?</text>
      </svg>
      <p className="mt-2 text-xs text-[var(--soft-ink-faint)]">карта пары появится здесь после оплаты</p>
    </div>
  );
}

export function SynastryResultView({
  result,
  recap,
  onStartNew,
  creditCost,
}: {
  result: SymbolicResult;
  recap: { userBirth: string; partnerBirth: string; question: string; topic: string | null };
  onStartNew: () => void;
  creditCost: number;
}) {
  const recapRows = [
    recap.userBirth.trim() ? { label: "Ваши данные", value: recap.userBirth.trim() } : null,
    recap.partnerBirth.trim() ? { label: "Данные партнёра", value: recap.partnerBirth.trim() } : null,
    recap.question.trim() ? { label: "Вопрос пары", value: recap.question.trim() } : null,
    recap.topic ? { label: "О чём", value: recap.topic } : null,
  ].filter((r): r is { label: string; value: string } => r !== null);

  return (
    <SymbolicResultScaffold
      productKey="synastry"
      eyebrow="совместимость по звёздам"
      heading="Ваша карта пары"
      recapSummary={recap.question.trim() ? `Вопрос: ${recap.question.trim()}` : "Данные пары и вопрос"}
      recapRows={recapRows}
      visual={<SynastryVisual result={result} />}
      resultText={result.resultText ?? ""}
      topic={recap.topic}
      creditCost={creditCost}
      repeat={{ ribbon: "разобрать ещё", title: "Сделать новый разбор пары", description: "Свежая совместимость по новым данным или вопросу.", ctaLabel: "Начать" }}
      onStartNew={onStartNew}
    />
  );
}

export function SynastryActions({ creditCost }: { creditCost: number }) {
  const { status: authStatus } = useSession();
  const isAuthenticated = authStatus === "authenticated";

  const [hasEntitlement, setHasEntitlement] = useState(false);
  const [result, setResult] = useState<SymbolicResult | null>(null);
  const [userBirth, setUserBirth] = useState("");
  const [partnerBirth, setPartnerBirth] = useState("");
  const [question, setQuestion] = useState("");
  const [topic, setTopic] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [exampleIdx, setExampleIdx] = useState(0);

  // #3: ввод обоих участников переживает переход на /login.
  const { clear: clearDraft } = useInputDraft(
    "synastry",
    { userBirth, partnerBirth, question, topic },
    (draft) => {
      if (typeof draft.userBirth === "string") setUserBirth(draft.userBirth);
      if (typeof draft.partnerBirth === "string") setPartnerBirth(draft.partnerBirth);
      if (typeof draft.question === "string") setQuestion(draft.question);
      if (typeof draft.topic === "string") setTopic(draft.topic);
    },
    { active: !result },
  );

  // Сессионность: восстановить разбор по ?reading=<id>.
  useEffect(() => {
    if (authStatus !== "authenticated") return;
    const readingId = readingIdFromUrl();
    if (!readingId) return;
    let cancelled = false;
    jsonRequest<{ result?: SymbolicResult }>(`/api/products/synastry/${readingId}`)
      .then((payload) => {
        if (cancelled || !payload.result) return;
        setResult(payload.result);
        const md = payload.result.metadata as { userBirthData?: unknown; partnerBirthData?: unknown; question?: unknown } | undefined;
        if (md) {
          if (typeof md.userBirthData === "string") setUserBirth(md.userBirthData);
          if (typeof md.partnerBirthData === "string") setPartnerBirth(md.partnerBirthData);
          if (typeof md.question === "string") setQuestion(md.question);
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [authStatus]);

  useEffect(() => {
    if (authStatus !== "authenticated" || readingIdFromUrl()) return;
    let cancelled = false;
    jsonRequest<ApiPayload>("/api/products/synastry")
      .then((payload) => { if (!cancelled) setHasEntitlement(Boolean(payload.hasEntitlement)); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [authStatus]);

  useEffect(() => {
    if (result) return;
    const id = window.setInterval(() => setExampleIdx((i) => i + 1), 3600);
    return () => window.clearInterval(id);
  }, [result]);

  async function generate() {
    if (!isAuthenticated) {
      redirectToLogin();
      return;
    }
    if (userBirth.trim().length < 4 || partnerBirth.trim().length < 4) {
      setMessage("Заполните данные рождения обоих участников: дата, примерное время и город.");
      setStatus("error");
      return;
    }
    setStatus("loading");
    setMessage(null);
    try {
      const payload = await jsonRequest<ApiPayload>("/api/products/synastry", {
        method: "POST",
        body: JSON.stringify({ userBirthData: userBirth, partnerBirthData: partnerBirth, question: question.trim() || undefined }),
      });
      setHasEntitlement(Boolean(payload.hasEntitlement));
      const next = payload.result ?? null;
      setResult(next);
      setStatus("idle");
      if (next?.id && typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("reading", next.id);
        window.history.replaceState(null, "", url.toString());
      }
    } catch (error) {
      const typed = error as Error & { status?: number };
      if (typed.status === 401) return redirectToLogin();
      if (typed.status === 402) {
        setHasEntitlement(false);
        setMessage("Откройте совместимость баллами или картой — результат появится здесь же.");
      } else if (typed.status === 503) {
        setMessage("Не получилось собрать разбор — попробуйте ещё раз. Баллы не списаны.");
      } else if (typed.status === 400) {
        setMessage("Заполните данные рождения обоих участников: дата, примерное время и город.");
      } else {
        setMessage(typed.message || "Не удалось собрать совместимость");
      }
      setStatus("error");
    }
  }

  function startNew() {
    setResult(null);
    setUserBirth("");
    setPartnerBirth("");
    setQuestion("");
    setTopic(null);
    setMessage(null);
    setStatus("idle");
    clearDraft();
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("reading");
      window.history.replaceState(null, "", url.toString());
    }
  }

  if (result?.resultText) {
    return (
      <SynastryResultView
        result={result}
        recap={{ userBirth, partnerBirth, question, topic }}
        onStartNew={startNew}
        creditCost={creditCost}
      />
    );
  }

  const placeholderExamples = examplesForTopic(topic);
  const placeholder = placeholderExamples[exampleIdx % placeholderExamples.length];

  return (
    <div className="soft-card tarot-order-surface" data-testid="synastry-actions">
      <div className="tarot-head">
        <p className="soft-eyebrow">совместимость по звёздам · язык пары</p>
      </div>

      {message && <p className="mt-4 rounded-2xl bg-[var(--soft-paper-deep)] p-3 text-sm text-[var(--soft-bordeaux)]">{message}</p>}

      <div className="tarot-controls">
        <OptionScrollStrip ariaLabel="О чём вопрос пары">
          {TOPICS.map((t) => (
            <OptionChoice key={t} active={topic === t} disabled={status === "loading"}
              onClick={() => { setTopic(topic === t ? null : t); setExampleIdx(0); }}>
              {t}
            </OptionChoice>
          ))}
        </OptionScrollStrip>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="soft-eyebrow tarot-question-label" htmlFor="synastry-user-birth">ваши данные рождения</label>
            <input
              id="synastry-user-birth"
              value={userBirth}
              onChange={(e) => setUserBirth(e.target.value.slice(0, 400))}
              placeholder="12.04.1992, 14:35, Москва"
              className="soft-question-input tarot-question-input tarot-line-input"
              disabled={status === "loading"}
              data-testid="synastry-user-birth"
            />
          </div>
          <div>
            <label className="soft-eyebrow tarot-question-label" htmlFor="synastry-partner-birth">данные партнёра</label>
            <input
              id="synastry-partner-birth"
              value={partnerBirth}
              onChange={(e) => setPartnerBirth(e.target.value.slice(0, 400))}
              placeholder="09.11.1990, 08:10, Санкт-Петербург"
              className="soft-question-input tarot-question-input tarot-line-input"
              disabled={status === "loading"}
              data-testid="synastry-partner-birth"
            />
          </div>
        </div>

        <label className="soft-eyebrow tarot-question-label" htmlFor="synastry-question">вопрос пары (необязательно)</label>
        <textarea
          id="synastry-question"
          value={question}
          onChange={(e) => setQuestion(e.target.value.slice(0, 2000))}
          placeholder={placeholder}
          rows={2}
          className="soft-question-input tarot-question-input tarot-compact-input"
          disabled={status === "loading"}
          data-testid="synastry-question"
        />

        <div className="mt-1">
          <SynastryTeaser />
        </div>

        <div className="tarot-action-row">
          {hasEntitlement ? (
            <Button onClick={generate} disabled={status === "loading"} className="soft-button soft-button-primary" data-testid="synastry-start">
              {status === "loading" ? "Собираем карту пары…" : "Открыть совместимость"}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          ) : (
            <ProductPurchaseControls
              productKey="synastry"
              label="Открыть совместимость"
              checkoutSource="synastry-direct"
              creditCost={creditCost}
              onUnlocked={() => {
                setHasEntitlement(true);
                if (userBirth.trim() && partnerBirth.trim()) {
                  void generate();
                } else {
                  setMessage("Доступ открыт. Добавьте данные рождения обоих — и карта пары появится здесь же.");
                }
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
