"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowLeft, ArrowRight, BookOpen, MessageSquareText, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductPurchaseControls } from "@/components/products/product-purchase-controls";
import { OptionScrollStrip, OptionChoice } from "@/components/products/option-scroll-strip";
import { ServiceTriage, type TriagePrimary, type TriageProduct } from "@/components/products/service-triage";
import { dialogueTopicFromChip, recommendSecondaryProducts } from "@/lib/product-format-recommendations";
import { appUrl, loginUrl } from "@/lib/subdomain";

// B441/B444 (M28): «Переосмысление» — самодостаточная услуга (когнитивный рефрейминг).
// Контекст собирается ВНУТРИ услуги (textarea + ленты темы/чувства в дизайне Таро),
// без первичного диалога. Бесплатного предпросмотра нет — один платный шаг сразу даёт
// полный результат: 4 угла (все через LLM); автосейв в Дневник; сессионность по ?resultId=.

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
  metadata?: { sourceText?: string | null; contextNote?: string | null };
};

// Разбираем заметку контекста («О чём: …\nЧто сильнее: …») обратно в чипы, чтобы
// recap корректно показывал тему/категорию у восстановленного по ?resultId= разбора.
function parseContextNote(note?: string | null): { topic: string | null; feeling: string | null } {
  if (!note) return { topic: null, feeling: null };
  const topic = note.match(/О чём:\s*(.+)/)?.[1]?.trim() ?? null;
  const feeling = note.match(/Что сильнее:\s*(.+)/)?.[1]?.trim() ?? null;
  return { topic, feeling };
}

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

// Контекст-чипы (тема + что сейчас сильнее). В дизайне Таро = две ленты выбора.
const TOPICS = ["работа", "отношения", "семья", "сам(а) с собой", "здоровье", "деньги", "другое"];
const FEELINGS = ["тревога", "злость", "вина", "грусть", "растерянность", "стыд", "пустота"];

// Динамические подсказки в поле ввода зависят от выбранной темы (как у Таро).
const EXAMPLES_BY_TOPIC: Record<string, string[]> = {
  "работа": [
    "Руководитель раскритиковал мою работу при всех, и я прокручиваю это и думаю, что меня скоро уволят.",
    "Получил(а) повышение, но кажется, что не справлюсь и все поймут, что я случайно здесь.",
  ],
  "отношения": [
    "Партнёр стал холоднее, отвечает коротко — и я уверен(а), что между нами всё кончено.",
    "Мы поссорились, я сказал(а) лишнее и теперь не могу перестать винить себя.",
  ],
  "семья": [
    "Мама снова раскритиковала мой выбор, и я чувствую себя так, будто мне снова десять лет.",
    "Разрываюсь между своей семьёй и родителями и постоянно чувствую вину перед всеми.",
  ],
  "сам(а) с собой": [
    "Я всё время сравниваю себя с другими и кажусь себе хуже, чем есть.",
    "Опять не сделал(а) то, что обещал(а) себе, и думаю, что я безвольный человек.",
  ],
  "здоровье": [
    "Жду результатов обследования и накручиваю себе самые страшные сценарии.",
    "Не могу заставить себя пойти к врачу и злюсь на себя за это.",
  ],
  "деньги": [
    "Из-за денег тревожно, кажется, что я ничего не контролирую и всё рухнет.",
    "Сорвался(ась) на лишние траты и теперь грызу себя, что никогда не научусь копить.",
  ],
  "другое": [
    "Опишите, что не отпускает: ситуацию, мысль или разговор, который крутится в голове.",
    "Что произошло, что вы себе об этом говорите и что чувствуете сильнее всего.",
  ],
};
const EXAMPLES_DEFAULT = [
  "Например: руководитель раскритиковал мою работу при всех, и я не могу перестать думать, что меня уволят.",
  "Опишите ситуацию или мысль, которая не отпускает, — и что вы себе об этом говорите.",
];

function examplesForTopic(topic: string | null): string[] {
  return (topic && EXAMPLES_BY_TOPIC[topic]) || EXAMPLES_DEFAULT;
}

function redirectToLogin() {
  if (typeof window === "undefined") return;
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.href = `${loginUrl()}?next=${next}`;
}

// Компактная карточка-кнопка угла: вместо «угол N» — сам заголовок угла; без
// строки-описания, чтобы карточки + раскрытый угол + Предыдущий/Следующий
// помещались на одном экране. Клик скроллит к началу блока с описанием.
function AngleCardPreview({ angle, active, onClick }: {
  angle: ReframeAngle;
  active: boolean;
  onClick: () => void;
}) {
  const style = ANGLE_STYLES[angle.id] ?? ANGLE_STYLES.thoughts;
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex flex-col rounded-[16px] p-3.5 text-left transition-all sm:p-4"
      style={{ background: style.bg, color: style.color, outline: active ? "2px solid var(--soft-bordeaux)" : "none", outlineOffset: 2, minHeight: 92 }}
    >
      <span className="absolute right-3.5 top-3" style={{ fontSize: 20, opacity: 0.5 }}>{ANGLE_GLYPHS[angle.id] ?? "·"}</span>
      <span className="pr-6 font-heading text-base font-semibold leading-tight sm:text-lg">{angle.title}</span>
      <span className="mt-1 text-[12.5px] italic leading-snug opacity-80">{angle.subtitle}</span>
      <span className="mt-auto pt-2 text-xs opacity-70">{active ? "открыто" : "читать"} →</span>
    </button>
  );
}

function AngleDetail({ angle, index, total, prevTitle, nextTitle, onPrev, onNext }: {
  angle: ReframeAngle;
  index: number;
  total: number;
  prevTitle?: string;
  nextTitle?: string;
  onPrev: () => void;
  onNext: () => void;
}) {
  const style = ANGLE_STYLES[angle.id] ?? ANGLE_STYLES.thoughts;
  return (
    <div className="rounded-[18px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper)] p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 font-heading text-base font-semibold" style={{ background: style.bg, color: style.color }}>
            <span aria-hidden="true">{ANGLE_GLYPHS[angle.id]}</span>
            {angle.title}
          </span>
          <span className="text-[13px] italic text-[var(--soft-ink-soft)]">{angle.subtitle}</span>
        </div>
        <span className="text-xs text-[var(--soft-ink-faint)]">{index + 1} / {total}</span>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div>
            <p className="soft-eyebrow mb-2">что я вижу</p>
            <ul className="flex flex-col gap-1.5">
              {angle.facts.map((f, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="mt-0.5 font-heading text-base leading-none" style={{ color: "var(--soft-terracotta-dark)" }}>·</span>
                  <span className="text-[14px] leading-relaxed text-[var(--soft-ink)]">{f}</span>
                </li>
              ))}
            </ul>
          </div>
          {angle.unknowns.length > 0 && (
            <div>
              <p className="soft-eyebrow mb-2">что стоит уточнить</p>
              <ul className="flex flex-col gap-1.5">
                {angle.unknowns.map((u, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="mt-0.5 font-heading text-base leading-none text-[var(--soft-lilac,#A89BC9)]">?</span>
                    <span className="text-[14px] leading-relaxed text-[var(--soft-ink-soft)]">{u}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {angle.options.length > 0 && (
            <div>
              <p className="soft-eyebrow mb-2">что можно сделать</p>
              <ul className="flex flex-col gap-1.5">
                {angle.options.map((o, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="mt-1 text-[12px] text-[var(--soft-sage,#8A9E7E)]">↗</span>
                    <span className="text-[14px] leading-relaxed text-[var(--soft-ink)]">{o}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {angle.ask && (
            <div className="rounded-[14px] bg-[var(--soft-paper-deep)] p-3.5">
              <p className="soft-eyebrow mb-1.5">вопрос к себе</p>
              <p className="font-heading text-[19px] italic leading-snug text-[var(--soft-bordeaux)]">«{angle.ask}»</p>
            </div>
          )}
        </div>
      </div>

      {angle.step && (
        <div className="mt-4 rounded-[14px] border border-dashed border-[var(--soft-terracotta,#D6856A)] p-3.5" style={{ background: "linear-gradient(140deg, #FFFCF5, #F4D9C1)" }}>
          <div className="flex items-start gap-2.5">
            <span className="text-[19px] text-[var(--soft-terracotta-dark)]">✦</span>
            <div>
              <p className="soft-eyebrow mb-1" style={{ color: "var(--soft-terracotta-dark)" }}>следующий шаг</p>
              <p className="font-heading text-base text-[var(--soft-bordeaux)]">{angle.step}</p>
            </div>
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap justify-between gap-2.5">
        <Button onClick={onPrev} disabled={index === 0} className="soft-button soft-button-ghost">
          <ArrowLeft className="size-4" aria-hidden="true" />
          {index === 0 ? "Предыдущий" : `Предыдущий: ${prevTitle}`}
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
  const [exampleIdx, setExampleIdx] = useState(0);
  const [recapOpen, setRecapOpen] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);

  // Сессионность: открыть конкретный сохранённый разбор по ?resultId=.
  useEffect(() => {
    if (!resultId || authStatus !== "authenticated") return;
    let cancelled = false;
    jsonRequest<ApiPayload>(`/api/products/reframe?resultId=${encodeURIComponent(resultId)}`)
      .then((payload) => {
        if (cancelled) return;
        setHasEntitlement(Boolean(payload.hasEntitlement));
        const restored = payload.results?.[0] ?? null;
        setResult(restored);
        setActiveAngle(0);
        // Восстанавливаем вопрос и категории, чтобы recap был полным после возврата.
        if (restored?.metadata?.sourceText) setSourceText(restored.metadata.sourceText);
        const ctx = parseContextNote(restored?.metadata?.contextNote);
        if (ctx.topic) setTopic(ctx.topic);
        if (ctx.feeling) setFeeling(ctx.feeling);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [authStatus, resultId]);

  // Узнаём доступ (entitlement) на свежем экране, чтобы показать прямой CTA.
  useEffect(() => {
    if (authStatus !== "authenticated" || resultId) return;
    let cancelled = false;
    jsonRequest<ApiPayload>("/api/products/reframe")
      .then((payload) => { if (!cancelled) setHasEntitlement(Boolean(payload.hasEntitlement)); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [authStatus, resultId]);

  // Живые подсказки в поле ввода (как у Таро).
  useEffect(() => {
    if (result) return;
    const id = window.setInterval(() => setExampleIdx((i) => i + 1), 3600);
    return () => window.clearInterval(id);
  }, [result]);

  function contextNote(): string | undefined {
    const parts = [topic ? `О чём: ${topic}` : "", feeling ? `Что сильнее: ${feeling}` : ""].filter(Boolean);
    return parts.length ? parts.join("\n") : undefined;
  }

  function scrollToDetail() {
    requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function generateReport() {
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
        body: JSON.stringify({ action: "generate", sourceText: sourceText.trim().slice(0, 6000), contextNote: contextNote() }),
      });
      setHasEntitlement(Boolean(payload.hasEntitlement));
      const next = payload.result ?? null;
      setResult(next);
      setActiveAngle(0);
      setStatus("idle");
      // Сессионность: привязываем разбор к ?resultId=, чтобы к нему можно было
      // вернуться (а свежий заход без параметра — это новая услуга).
      if (next?.id && typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("resultId", next.id);
        window.history.replaceState(null, "", url.toString());
      }
    } catch (error) {
      const typed = error as Error & { status?: number };
      if (typed.status === 402) {
        setHasEntitlement(false);
        setMessage("Откройте переосмысление баллами или картой — результат появится здесь же.");
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
    setSourceText("");
    setTopic(null);
    setFeeling(null);
    setActiveAngle(0);
    setMessage(null);
    setStatus("idle");
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("resultId");
      window.history.replaceState(null, "", url.toString());
    }
  }

  const parsed = result?.resultText ? tryParseReframe(result.resultText) : null;
  const angles = parsed?.angles ?? [];

  // Рекомендации в дизайне Таро: повторить услугу + продолжить в чате (основные),
  // затем «другие форматы» и специалист внутри ServiceTriage.
  const topicKey = dialogueTopicFromChip(topic);
  const triagePrimary: TriagePrimary[] = [
    {
      key: "repeat",
      testId: "reframe-new-reading",
      ribbon: "переосмыслить ещё",
      icon: Sparkles,
      title: "Переосмыслить другую ситуацию",
      description: "Свежий разбор по новому запросу — четыре угла лягут заново.",
      priceSub: "1 балл за разбор",
      ctaLabel: "Начать",
      onClick: startNew,
    },
    {
      key: "chat",
      testId: "reframe-continue-chat",
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
  const triageSecondary: TriageProduct[] = recommendSecondaryProducts(topicKey, "reframe", 4)
    .filter((item) => item.slug !== "reframe")
    .slice(0, 3)
    .map((item) => ({ slug: item.slug, name: item.name, href: item.href, price: item.price, creditCost: item.creditCost }));

  // ── Result view: 4 углов + воронка ─────────────────────────────────────
  if (angles.length > 0) {
    const cat = [topic, feeling].filter(Boolean).join(" · ");
    return (
      <div className="soft-card soft-form-panel mt-8" data-testid="reframe-actions">
        <div className="tarot-head">
          <p className="soft-eyebrow">когнитивный рефрейминг</p>
        </div>
        <h2 className="soft-h3 mt-1">Ваша ситуация под четырьмя углами</h2>

        {message && <p className="mt-4 rounded-2xl bg-[var(--soft-paper-deep)] p-3 text-sm text-[var(--soft-bordeaux)]">{message}</p>}

        {/* Свёрнутый блок с заданным вопросом и категориями (как у Таро). */}
        <details
          className="tarot-controls-collapsed mt-4"
          data-testid="reframe-recap"
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

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {angles.map((angle, i) => (
            <AngleCardPreview
              key={angle.id}
              angle={angle}
              active={i === activeAngle}
              onClick={() => { setActiveAngle(i); scrollToDetail(); }}
            />
          ))}
        </div>
        <div ref={detailRef} className="mt-4 scroll-mt-20">
          <AngleDetail
            key={activeAngle}
            angle={angles[activeAngle]}
            index={activeAngle}
            total={angles.length}
            prevTitle={angles[activeAngle - 1]?.title}
            nextTitle={angles[activeAngle + 1]?.title}
            onPrev={() => { setActiveAngle((v) => Math.max(0, v - 1)); scrollToDetail(); }}
            onNext={() => { setActiveAngle((v) => Math.min(angles.length - 1, v + 1)); scrollToDetail(); }}
          />
        </div>

        <ServiceTriage
          eyebrow="что дальше"
          testId="reframe-triage"
          primary={triagePrimary}
          secondary={triageSecondary}
          specialistHref="/practitioners"
        />

        <p className="mt-3 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 text-center text-xs text-[var(--soft-ink-faint)]">
          <BookOpen className="size-3.5" aria-hidden="true" />
          <span>Переосмысление сохранено в</span>
          <Link href={appUrl("/diary")} className="font-medium text-[var(--soft-ink-soft)] underline-offset-2 hover:underline">дневнике</Link>
          <span>— там его можно перечитать, скачать PDF или удалить.</span>
        </p>
      </div>
    );
  }

  // ── Intake view (дизайн Таро, без предпросмотра) ───────────────────────
  const placeholderExamples = examplesForTopic(topic);
  const placeholder = placeholderExamples[exampleIdx % placeholderExamples.length];

  return (
    <div className="soft-card tarot-order-surface" data-testid="reframe-actions">
      <div className="tarot-head">
        <p className="soft-eyebrow">когнитивный рефрейминг</p>
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

        <OptionScrollStrip ariaLabel="Что сейчас сильнее">
          {FEELINGS.map((f) => (
            <OptionChoice key={f} active={feeling === f} disabled={status === "loading"}
              onClick={() => setFeeling(feeling === f ? null : f)}>
              {f}
            </OptionChoice>
          ))}
        </OptionScrollStrip>

        <label className="soft-eyebrow tarot-question-label" htmlFor="reframe-input">ситуация или мысль, которая не отпускает</label>
        <textarea
          id="reframe-input"
          value={sourceText}
          onChange={(e) => setSourceText(e.target.value.slice(0, 6000))}
          placeholder={placeholder}
          rows={3}
          className="soft-question-input tarot-question-input"
          disabled={status === "loading"}
          data-testid="reframe-input"
        />

        <div className="tarot-action-row">
          {hasEntitlement ? (
            <Button onClick={generateReport} disabled={status === "loading"} className="soft-button soft-button-primary" data-testid="reframe-start">
              {status === "loading" ? "Анализируем…" : "Провести анализ"}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          ) : (
            <ProductPurchaseControls
              productKey="reframe"
              label="Открыть переосмысление"
              checkoutSource="reframe-generate"
              creditCost={1}
              onUnlocked={() => { setHasEntitlement(true); void generateReport(); }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
