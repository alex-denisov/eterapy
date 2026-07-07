"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowRight, BookOpen, MessageSquareText, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SoftMarkdown } from "@/components/ui/soft-markdown";
import { ProductPurchaseControls } from "@/components/products/product-purchase-controls";
import { OptionScrollStrip, OptionChoice } from "@/components/products/option-scroll-strip";
import { ServiceTriage, type TriagePrimary, type TriageProduct } from "@/components/products/service-triage";
import { SectionAccordion } from "@/components/products/section-accordion";
import { splitSections } from "@/lib/report-sections";
import { dialogueTopicFromChip, recommendSecondaryProducts } from "@/lib/product-format-recommendations";
import { appUrl, loginUrl } from "@/lib/subdomain";

// B442/B444 (M28): «Подробный разбор» — самодостаточная услуга (клиническая
// формулировка случая «5 P» + problem-solving). Контекст собирается ВНУТРИ услуги
// (textarea + ленты темы/цели в дизайне Таро), без первичного диалога и без
// предпросмотра/оглавления. Один платный шаг сразу даёт полный документ 6–10 страниц.
// Результат — аккордеон по главам; автосейв в Дневник; сессионность по ?resultId=.

const TOPICS = ["работа", "отношения", "семья", "сам(а) с собой", "здоровье", "деньги", "другое"];
const GOALS = ["понять причины", "принять решение", "снизить тревогу", "подготовиться к разговору"];

const EXAMPLES_BY_TOPIC: Record<string, string[]> = {
  "работа": [
    "Третий год не могу решиться сменить работу: вроде стабильно, но каждое утро тяжело вставать, и я не понимаю, это выгорание или не моё место.",
    "Меня повысили, команда теперь в подчинении, и я не справляюсь с тревогой и конфликтами — боюсь, что всё развалится из-за меня.",
  ],
  "отношения": [
    "Мы вместе пять лет, но в последний год всё чаще ссоримся и отдаляемся. Я не понимаю, это кризис, который пройдёт, или нам пора расстаться.",
    "После измены пытаемся сохранить отношения, но я не могу доверять и постоянно проверяю. Хочу понять, как жить дальше.",
  ],
  "семья": [
    "Мама тяжело болеет, забота легла на меня, я разрываюсь между ней, своей семьёй и работой и чувствую вину со всех сторон.",
    "С подростком потеряли контакт: он закрылся, грубит, я срываюсь, потом виню себя. Хочу понять, что происходит и что делать.",
  ],
  "сам(а) с собой": [
    "Внешне всё хорошо, но внутри пусто и нет сил. Я не понимаю, чего хочу, и будто живу чужую жизнь.",
    "Я постоянно откладываю важное, ругаю себя, и от этого делаю ещё меньше. Хочу разобраться в этом замкнутом круге.",
  ],
  "здоровье": [
    "После диагноза тревога не отпускает, я не сплю и накручиваю себе худшее. Хочу понять, как вернуть опору.",
    "Хроническая болезнь меняет мою жизнь и планы, я злюсь и горюю по прежнему себе и не знаю, как это принять.",
  ],
  "деньги": [
    "Из-за долгов и нестабильного дохода я живу в постоянной тревоге, ссорюсь с близкими о деньгах и не вижу выхода.",
    "Мне предлагают рискованный, но прибыльный проект. Я разрываюсь между страхом и амбициями и не могу выбрать.",
  ],
  "другое": [
    "Опишите ситуацию подробно: что происходит, как давно, что вы уже пробовали и в чём сейчас главный вопрос.",
    "Чем больше деталей — людей, событий, ваших мыслей и чувств — тем точнее и полезнее будет разбор.",
  ],
};
const EXAMPLES_DEFAULT = [
  "Что происходит, как давно, что вы уже пробовали и в чём сейчас главный вопрос. Чем больше деталей — тем точнее разбор.",
  "Опишите ситуацию подробно: события, людей, ваши мысли и чувства, и что вы хотите понять.",
];

function examplesForTopic(topic: string | null): string[] {
  return (topic && EXAMPLES_BY_TOPIC[topic]) || EXAMPLES_DEFAULT;
}

type DeepReportResult = {
  id: string;
  status: string;
  title: string;
  previewText: string | null;
  resultText: string | null;
  saved: boolean;
  metadata?: { sourceText?: string | null; contextNote?: string | null };
};

// Разбираем заметку контекста («О чём: …\nЦель разбора: …») обратно в чипы, чтобы
// recap корректно показывал тему/цель у восстановленного по ?resultId= разбора.
function parseContextNote(note?: string | null): { topic: string | null; goal: string | null } {
  if (!note) return { topic: null, goal: null };
  const topic = note.match(/О чём:\s*(.+)/)?.[1]?.trim() ?? null;
  const goal = note.match(/Цель разбора:\s*(.+)/)?.[1]?.trim() ?? null;
  return { topic, goal };
}

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
  const [exampleIdx, setExampleIdx] = useState(0);
  const [recapOpen, setRecapOpen] = useState(false);

  // Сессионность: открыть конкретный сохранённый разбор по ?resultId=.
  useEffect(() => {
    if (!resultId || authStatus !== "authenticated") return;
    let cancelled = false;
    jsonRequest<ApiPayload>(`/api/products/deep-report?resultId=${encodeURIComponent(resultId)}`)
      .then((payload) => {
        if (cancelled) return;
        setHasEntitlement(Boolean(payload.hasEntitlement));
        const restored = payload.results?.[0] ?? null;
        setResult(restored);
        // Восстанавливаем вопрос и категории, чтобы recap был полным после возврата.
        if (restored?.metadata?.sourceText) setSourceText(restored.metadata.sourceText);
        const ctx = parseContextNote(restored?.metadata?.contextNote);
        if (ctx.topic) setTopic(ctx.topic);
        if (ctx.goal) setGoal(ctx.goal);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [authStatus, resultId]);

  // Узнаём доступ на свежем экране, чтобы показать прямой CTA.
  useEffect(() => {
    if (authStatus !== "authenticated" || resultId) return;
    let cancelled = false;
    jsonRequest<ApiPayload>("/api/products/deep-report")
      .then((payload) => { if (!cancelled) setHasEntitlement(Boolean(payload.hasEntitlement)); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [authStatus, resultId]);

  useEffect(() => {
    if (result) return;
    const id = window.setInterval(() => setExampleIdx((i) => i + 1), 3600);
    return () => window.clearInterval(id);
  }, [result]);

  function contextNote(): string | undefined {
    const parts = [topic ? `О чём: ${topic}` : "", goal ? `Цель разбора: ${goal}` : ""].filter(Boolean);
    return parts.length ? parts.join("\n") : undefined;
  }

  async function generateReport() {
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
        body: JSON.stringify({ action: "generate", sourceText: sourceText.trim().slice(0, 8000), contextNote: contextNote() }),
      });
      setHasEntitlement(Boolean(payload.hasEntitlement));
      const next = payload.result ?? null;
      setResult(next);
      setStatus("idle");
      if (next?.id && typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("resultId", next.id);
        window.history.replaceState(null, "", url.toString());
      }
    } catch (error) {
      const typed = error as Error & { status?: number };
      if (typed.status === 402) {
        setHasEntitlement(false);
        setMessage("Откройте подробный разбор баллами или картой — документ появится здесь же.");
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
    setSourceText("");
    setTopic(null);
    setGoal(null);
    setMessage(null);
    setStatus("idle");
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("resultId");
      window.history.replaceState(null, "", url.toString());
    }
  }

  const topicKey = dialogueTopicFromChip(topic);
  const triagePrimary: TriagePrimary[] = [
    {
      key: "repeat",
      testId: "deep-report-new",
      ribbon: "разобрать ещё",
      icon: Sparkles,
      title: "Разобрать другую ситуацию",
      description: "Свежий подробный разбор по новому запросу — документ соберётся заново.",
      priceSub: "3 балла за разбор",
      ctaLabel: "Начать",
      onClick: startNew,
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
  const triageSecondary: TriageProduct[] = recommendSecondaryProducts(topicKey, "deep-report", 4)
    .filter((item) => item.slug !== "deep-report")
    .slice(0, 3)
    .map((item) => ({ slug: item.slug, name: item.name, href: item.href, price: item.price, creditCost: item.creditCost }));

  // ── Result view: заголовок + recap + аккордеон по главам + воронка ──────
  if (result?.resultText) {
    const sections = splitSections(result.resultText);
    const cat = [topic, goal].filter(Boolean).join(" · ");
    return (
      <div className="soft-card soft-form-panel mt-8" data-testid="deep-report-actions">
        <div className="tarot-head">
          <p className="soft-eyebrow">структурный разбор ситуации</p>
        </div>
        <h2 className="soft-h3 mt-1">Ваш подробный разбор</h2>

        {message && <p className="mt-4 rounded-2xl bg-[var(--soft-paper-deep)] p-3 text-sm text-[var(--soft-bordeaux)]">{message}</p>}

        {/* Свёрнутый блок с заданным вопросом и категориями (как у Таро). */}
        <details
          className="tarot-controls-collapsed mt-4"
          data-testid="deep-report-recap"
          open={recapOpen}
          onToggle={(e) => setRecapOpen((e.currentTarget as HTMLDetailsElement).open)}
        >
          <summary>
            <span className="tarot-collapsed-q">
              {sourceText.trim() ? `Вопрос: ${sourceText.trim()}` : "Ваш запрос и категории"}
            </span>
            <span className="tarot-collapsed-hint">{recapOpen ? "скрыть" : "показать"}</span>
          </summary>
          <dl className="tarot-recap">
            {sourceText.trim() && (
              <div>
                <dt>Запрос</dt>
                <dd>{sourceText.trim()}</dd>
              </div>
            )}
            {cat && (
              <div>
                <dt>Категории</dt>
                <dd>{cat}</dd>
              </div>
            )}
          </dl>
        </details>

        <div className="mt-5">
          {sections.length > 0 ? (
            <SectionAccordion sections={sections} testId="deep-report-accordion" itemTestId="deep-report-section" />
          ) : (
            <article className="soft-card rounded-[16px] p-6 font-heading text-[1.05rem] leading-relaxed text-[var(--soft-ink)]">
              <SoftMarkdown content={result.resultText} />
            </article>
          )}
        </div>

        <ServiceTriage
          eyebrow="что дальше"
          testId="deep-report-triage"
          primary={triagePrimary}
          secondary={triageSecondary}
          specialistHref="/practitioners"
        />

        <p className="mt-3 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 text-center text-xs text-[var(--soft-ink-faint)]">
          <BookOpen className="size-3.5" aria-hidden="true" />
          <span>Разбор сохранён в</span>
          <Link href={appUrl("/diary")} className="font-medium text-[var(--soft-ink-soft)] underline-offset-2 hover:underline">дневнике</Link>
          <span>— там его можно перечитать, скачать PDF или удалить.</span>
        </p>
      </div>
    );
  }

  // ── Intake view (дизайн Таро, без предпросмотра и оглавления) ───────────
  const placeholderExamples = examplesForTopic(topic);
  const placeholder = placeholderExamples[exampleIdx % placeholderExamples.length];

  return (
    <div className="soft-card tarot-order-surface" data-testid="deep-report-actions">
      <div className="tarot-head">
        <p className="soft-eyebrow">структурный разбор · 6–10 страниц</p>
      </div>

      {message && <p className="mt-4 rounded-2xl bg-[var(--soft-paper-deep)] p-3 text-sm text-[var(--soft-bordeaux)]">{message}</p>}

      <div className="tarot-controls">
        <OptionScrollStrip ariaLabel="О чём это">
          {TOPICS.map((t) => (
            <OptionChoice key={t} active={topic === t} disabled={status === "loading"}
              onClick={() => { setTopic(topic === t ? null : t); setExampleIdx(0); }}>
              {t}
            </OptionChoice>
          ))}
        </OptionScrollStrip>

        <OptionScrollStrip ariaLabel="Что хотите получить">
          {GOALS.map((g) => (
            <OptionChoice key={g} active={goal === g} disabled={status === "loading"}
              onClick={() => setGoal(goal === g ? null : g)}>
              {g}
            </OptionChoice>
          ))}
        </OptionScrollStrip>

        <label className="soft-eyebrow tarot-question-label" htmlFor="deep-report-input">опишите ситуацию подробно</label>
        <textarea
          id="deep-report-input"
          value={sourceText}
          onChange={(e) => setSourceText(e.target.value.slice(0, 8000))}
          placeholder={placeholder}
          rows={3}
          className="soft-question-input tarot-question-input"
          disabled={status === "loading"}
          data-testid="deep-report-input"
        />

        <div className="tarot-action-row">
          {hasEntitlement ? (
            <Button onClick={generateReport} disabled={status === "loading"} className="soft-button soft-button-primary" data-testid="deep-report-start">
              {status === "loading" ? "Собираем разбор…" : "Сформировать разбор"}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          ) : (
            <ProductPurchaseControls
              productKey="deep-report"
              label="Открыть подробный разбор"
              checkoutSource="deep-report-generate"
              creditCost={3}
              onUnlocked={() => { setHasEntitlement(true); void generateReport(); }}
            />
          )}
        </div>
      </div>

    </div>
  );
}
