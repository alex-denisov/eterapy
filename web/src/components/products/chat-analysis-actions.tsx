"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowRight, ArrowUpRight, BookOpen, Check, ClipboardPaste, Copy, FileText, ImageIcon, LockKeyhole, RotateCcw, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SoftMarkdown } from "@/components/ui/soft-markdown";
import { ProductPurchaseControls } from "@/components/products/product-purchase-controls";
import { getNextStepRecommendation, type NextStepRecommendation } from "@/lib/product-recommendations";
import { appUrl } from "@/lib/subdomain";

type ToneEntry = { label: string; pct: number };
type ReplyVariant = { style: string; text: string };

type ChatAnalysisStructured = {
  insight: string;
  tonesThem: ToneEntry[];
  tonesMe: ToneEntry[];
  replies: ReplyVariant[];
  safetyNote: string;
};

function tryParseChatAnalysis(text: string): ChatAnalysisStructured | null {
  if (!text) return null;
  try {
    const raw = JSON.parse(text) as Partial<ChatAnalysisStructured>;
    if (!raw.insight || !Array.isArray(raw.replies)) return null;
    return raw as ChatAnalysisStructured;
  } catch {
    return null;
  }
}

type ChatAnalysisResult = {
  id: string;
  status: string;
  title: string;
  previewText: string | null;
  resultText: string | null;
  saved: boolean;
  metadata?: {
    sourceText?: string | null;
    sourceDeletedAt?: string | null;
    sourceKind?: string | null;
    recognizedText?: string | null;
    piiMasked?: boolean | null;
    screenshotStored?: boolean | null;
    screenshotCount?: number | null;
    recognizedScreenshotCount?: number | null;
    // B395: эмоции-подсказки, которые ИИ считал в диалоге (ваш тон) — ими
    // динамически наполняется блок «что вы сейчас чувствуете».
    suggestedEmotions?: string[] | null;
  };
};

type ApiPayload = {
  hasEntitlement?: boolean;
  result?: ChatAnalysisResult;
  results?: ChatAnalysisResult[];
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

// B395: приложенные файлы показываем как мини-вложения (превью + удаление).
type Attachment = { id: string; name: string; kind: "image" | "text"; url?: string };

// B395: iOS-style activity indicator (rotating «flower» of fading petals). Used
// inside the primary button so the loading state never shifts layout width.
function IosSpinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`animate-spin ${className ?? ""}`} aria-hidden="true">
      {Array.from({ length: 8 }).map((_, i) => (
        <rect
          key={i}
          x="11"
          y="2.5"
          width="2"
          height="6"
          rx="1"
          fill="currentColor"
          opacity={0.15 + (i / 7) * 0.85}
          transform={`rotate(${i * 45} 12 12)`}
        />
      ))}
    </svg>
  );
}

const CONTACTS = ["партнёр", "бывший(ая)", "родитель", "друг", "коллега", "начальник", "другой"];
const EMOTIONS = ["растерянность", "злость", "вина", "грусть", "страх", "пустота", "стыд"];

// B395: тон разговора — сегментированная лента + ЛЕГЕНДА (точка того же оттенка
// + название + %), чтобы было видно, какой сегмент к какой характеристике
// относится. Доли нормируем к 100% (pct тонов в сумме ≈ 200%, см. lib/chat-analysis).
function ToneRow({ who, tones, hue }: { who: string; tones: ToneEntry[]; hue: "them" | "me" }) {
  const items = tones.filter((t) => t.pct > 0).slice(0, 4);
  const total = items.reduce((sum, t) => sum + t.pct, 0) || 1;
  const base = hue === "them" ? "var(--soft-terracotta-dark)" : "var(--soft-bordeaux)";
  const shade = (i: number) => ({ background: base, opacity: 1 - i * 0.2 });
  return (
    <div>
      <span className="text-[13.5px] font-medium text-[var(--soft-ink)]">{who}</span>
      <div className="mt-2 flex h-2.5 gap-px overflow-hidden rounded-full" style={{ background: "var(--soft-paper-edge)" }}>
        {items.map((t, i) => (
          <div key={t.label} title={`${t.label} · ${t.pct}%`} style={{ width: `${(t.pct / total) * 100}%`, ...shade(i) }} />
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1.5">
        {items.map((t, i) => (
          <span key={t.label} className="inline-flex items-center gap-1.5 text-[12px] text-[var(--soft-ink-soft)]">
            <span className="size-2 shrink-0 rounded-full" style={shade(i)} />
            {t.label}
            <span className="text-[var(--soft-ink-faint)]">{t.pct}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// B395: варианты ответа — это черновики, которые можно отправить. Кнопка копии
// делает их рабочим инструментом; ставит галочку на ~1.5с после копирования.
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          // B395: копируем готовый к отправке текст — без кавычек-«ёлочек».
          await navigator.clipboard.writeText(text.replace(/[«»]/g, "").trim());
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          /* буфер обмена недоступен — тихо игнорируем */
        }
      }}
      aria-label="Скопировать ответ"
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--soft-ink-faint)] transition-colors hover:bg-[var(--soft-paper-deep)] hover:text-[var(--soft-bordeaux)]"
    >
      {copied ? <Check className="size-4 text-[var(--soft-sage)]" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
    </button>
  );
}

// B395: «следующий шаг» — единственный насыщенный (бордовый) акцент экрана.
// Карточка-рекомендация следующей услуги, к которой ВИЗУАЛЬНО ПРИСОЕДИНЕНА
// кнопка «Начать новый разбор» (одна поверхность, разделённая тонкой линией).
function NextStepCard({ rec, onStartNew, loading }: {
  rec: NextStepRecommendation | null;
  onStartNew: () => void;
  loading: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-[20px]" style={{ background: "var(--soft-bordeaux)" }}>
      {rec && (
        <div className="p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "#E9B59B" }}>
            {rec.eyebrow}
          </p>
          <p className="mt-2 font-heading text-[1.3rem] leading-snug" style={{ color: "#FFF4E8" }}>{rec.name}</p>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: "rgba(251,240,225,0.82)" }}>{rec.reason}</p>
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link
              href={rec.href}
              data-testid="chat-analysis-next-step"
              className="inline-flex items-center gap-2 rounded-full bg-[#FBF0E1] px-5 py-2.5 text-sm font-semibold text-[var(--soft-bordeaux)] transition hover:brightness-[1.04]"
            >
              {rec.cta}
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
            <span className="text-sm" style={{ color: "rgba(251,240,225,0.66)" }}>{rec.price}</span>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={onStartNew}
        disabled={loading}
        data-testid="chat-analysis-start-new"
        className="flex w-full items-center justify-center gap-2 px-6 py-3.5 text-sm font-medium transition hover:bg-[rgba(255,255,255,0.06)] disabled:opacity-50"
        style={rec
          ? { borderTop: "1px solid rgba(251,240,225,0.16)", color: "rgba(251,240,225,0.9)" }
          : { color: "rgba(251,240,225,0.9)" }}
      >
        <RotateCcw className="size-4" aria-hidden="true" />
        Начать новый разбор
      </button>
    </div>
  );
}

function StructuredResult({ data, recommendation, onStartNew, loading }: {
  data: ChatAnalysisStructured;
  recommendation: NextStepRecommendation | null;
  onStartNew: () => void;
  loading: boolean;
}) {
  return (
    <div className="mt-4 flex flex-col gap-3.5" data-testid="chat-analysis-result">
      {/* главное — один спокойный тёплый блок (без двухцветного градиента) */}
      <div className="rounded-[20px] px-6 py-5" style={{ background: "var(--soft-paper-warm)" }}>
        <p className="soft-eyebrow">главное</p>
        <p className="mt-2.5 font-heading text-[1.45rem] italic leading-snug text-[var(--soft-bordeaux)]">
          {data.insight}
        </p>
      </div>

      {/* тон разговора — один блок, две ленты, две приглушённые гаммы */}
      <div className="soft-card p-5">
        <p className="soft-eyebrow mb-4">тон разговора</p>
        <div className="flex flex-col gap-4">
          <ToneRow who="Собеседник" tones={data.tonesThem} hue="them" />
          <div className="h-px bg-[var(--soft-paper-edge)]" />
          <ToneRow who="Вы" tones={data.tonesMe} hue="me" />
        </div>
      </div>

      {/* что можно ответить — черновики через тонкие разделители + копирование */}
      <div className="soft-card p-5">
        <p className="soft-eyebrow mb-1">что можно ответить</p>
        <p className="text-xs text-[var(--soft-ink-faint)]">Три тона на выбор — можно скопировать и отправить.</p>
        <div className="mt-2 flex flex-col">
          {data.replies.map((r, i) => (
            <div key={i} className={`flex items-start gap-3 py-3.5 ${i > 0 ? "border-t border-[var(--soft-paper-edge)]" : ""}`}>
              <div className="min-w-0 flex-1">
                <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--soft-ink-faint)]">{r.style}</span>
                <p className="mt-1 font-heading text-[1.05rem] italic leading-relaxed text-[var(--soft-ink)]">{r.text}</p>
              </div>
              <CopyButton text={r.text} />
            </div>
          ))}
        </div>
      </div>

      {/* безопасность — тихая подпись (контент сохранён, без громкого блока) */}
      {data.safetyNote && (
        <p className="flex items-start gap-2 px-1 text-[12.5px] leading-relaxed text-[var(--soft-ink-soft)]">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
          <span>{data.safetyNote}</span>
        </p>
      )}

      {/* следующий шаг (CTA) + «начать новый разбор» — одна поверхность */}
      <NextStepCard rec={recommendation} onStartNew={onStartNew} loading={loading} />

      {/* разбор уже в дневнике — тихая строка-напоминание (вместо кнопок) */}
      <p className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 text-center text-xs text-[var(--soft-ink-faint)]">
        <BookOpen className="size-3.5" aria-hidden="true" />
        <span>Разбор сохранён в</span>
        <Link href={appUrl("/diary")} className="font-medium text-[var(--soft-ink-soft)] underline-offset-2 hover:underline">дневнике</Link>
        <span>— там его можно перечитать или удалить.</span>
      </p>
    </div>
  );
}

export function ChatAnalysisActions() {
  const { status: authStatus } = useSession();
  const [result, setResult] = useState<ChatAnalysisResult | null>(null);
  const [hasEntitlement, setHasEntitlement] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "paying" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const [tab, setTab] = useState<"input" | "context" | "result">("input");
  const [sourceText, setSourceText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  // B330/Z7: the old ownership gate was removed because chats are multi-party
  // by nature. Privacy is conveyed through the inline notice and delete-source
  // affordance after generation.
  const [contact, setContact] = useState<string | null>(null);
  const [emotion, setEmotion] = useState<string | null>(null);
  const [goal, setGoal] = useState("");
  const screenshotInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    let cancelled = false;
    jsonRequest<ApiPayload>("/api/products/chat-analysis")
      .then((payload) => {
        if (cancelled) return;
        setHasEntitlement(Boolean(payload.hasEntitlement));
        const existing = payload.results?.[0] ?? null;
        // B330: do NOT auto-restore an already-saved analysis on mount.
        // A saved record lives in Мою карту; re-entering /products/chat-analysis
        // should start fresh so the user can buy and run another analysis.
        // We still surface an unsaved preview so an in-progress upload isn't
        // lost on refresh.
        if (existing && !existing.saved) {
          setResult(existing);
          if (existing.resultText) setTab("result");
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [authStatus]);

  function readAsDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
      reader.readAsDataURL(file);
    });
  }

  function readAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
      reader.readAsText(file);
    });
  }

  // Upload one or more screenshots. Each image is OCR'd server-side and the
  // recognized text is appended to the running sourceText so users can build
  // up a long conversation across multiple screenshots.
  async function uploadScreenshots(files: FileList | null) {
    if (!files || files.length === 0) return;
    setStatus("loading");
    setMessage(null);
    try {
      const selectedFiles = Array.from(files).slice(0, 10);
      const screenshots = await Promise.all(selectedFiles.map(async (file) => ({
        imageDataUrl: await readAsDataURL(file),
        fileName: file.name,
      })));
      const payload = await jsonRequest<ApiPayload>("/api/products/chat-analysis", {
        method: "POST",
        body: JSON.stringify({ action: "screenshots_preview", screenshots }),
      });
      setHasEntitlement(Boolean(payload.hasEntitlement));

      const recognized = payload.result?.metadata?.recognizedText ?? "";
      const combined = sourceText.trim() && recognized
        ? `${sourceText.trim()}\n\n${recognized}`
        : recognized || sourceText.trim();
      const screenshotCount = payload.result?.metadata?.screenshotCount ?? selectedFiles.length;
      const recognizedCount = payload.result?.metadata?.recognizedScreenshotCount ?? screenshotCount;
      const failedCount = Math.max(0, screenshotCount - recognizedCount);
      setSourceText(combined);
      setAttachments((prev) => [
        ...prev,
        ...screenshots.map((shot) => ({
          id: crypto.randomUUID(),
          name: shot.fileName ?? "Скриншот",
          kind: "image" as const,
          url: shot.imageDataUrl,
        })),
      ]);
      setResult(payload.result ?? null);
      if (failedCount > 0) {
        setMessage(
          failedCount === screenshotCount
            ? "Не удалось распознать текст на скриншотах. Попробуйте другие файлы или вставьте текст вручную в поле ниже."
            : `Часть скриншотов (${failedCount}) не распозналась — добавьте их текст вручную в поле ниже.`,
        );
        setStatus("error");
      } else {
        setStatus("idle");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось распознать скриншот");
      setStatus("error");
    }
  }

  // Read a .txt or Telegram export file as plain text into the textarea.
  async function uploadTextFile(file: File | null) {
    if (!file) return;
    setStatus("loading");
    setMessage(null);
    try {
      const text = await readAsText(file);
      const combined = sourceText.trim() ? `${sourceText.trim()}\n\n${text}` : text;
      setSourceText(combined.slice(0, 10000));
      setAttachments((prev) => [...prev, { id: crypto.randomUUID(), name: file.name, kind: "text" as const }]);
      setStatus("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось прочитать файл");
      setStatus("error");
    }
  }

  // B395: remove an attachment chip. The recognized text already merged into the
  // textarea stays editable there; this clears the visual attachment + preview.
  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((item) => item.id !== id));
  }

  // Paste from clipboard — works for "Из Telegram" affordance. Browsers
  // require user gesture, which the chip click provides.
  async function pasteFromClipboard() {
    setMessage(null);
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setMessage("В буфере обмена нет текста — скопируйте переписку и нажмите ещё раз.");
        setStatus("error");
        return;
      }
      const combined = sourceText.trim() ? `${sourceText.trim()}\n\n${text}` : text;
      setSourceText(combined.slice(0, 10000));
    } catch {
      setMessage("Браузер не дал доступ к буферу обмена — скопируйте текст в поле руками.");
      setStatus("error");
    }
  }

  async function proceedToContext() {
    if (!sourceText.trim()) return;
    setStatus("loading");
    setMessage(null);
    try {
      const payload = await jsonRequest<ApiPayload>("/api/products/chat-analysis", {
        method: "POST",
        body: JSON.stringify({ sourceText: sourceText.trim(), action: "upload_preview" }),
      });
      setHasEntitlement(Boolean(payload.hasEntitlement));
      setResult(payload.result ?? null);
      setStatus("idle");
      setTab("context");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось загрузить переписку");
      setStatus("error");
    }
  }

  async function generateReport() {
    if (!result?.id) return;
    setStatus("loading");
    setMessage(null);
    try {
      const contextNote = [
        contact ? `Кто собеседник: ${contact}` : "",
        emotion ? `Мои чувства: ${emotion}` : "",
        goal ? `Чего хочу от разбора: ${goal}` : "",
      ].filter(Boolean).join("\n");

      const payload = await jsonRequest<ApiPayload>("/api/products/chat-analysis", {
        method: "POST",
        body: JSON.stringify({
          id: result.id,
          action: "generate",
          contextNote: contextNote || undefined,
        }),
      });
      setHasEntitlement(Boolean(payload.hasEntitlement));
      setResult(payload.result ?? null);
      setStatus("idle");
      setTab("result");
    } catch (error) {
      const typed = error as Error & { status?: number };
      if (typed.status === 402) {
        setMessage("Откройте доступ к разбору переписки баллами или картой — распознанный текст останется здесь.");
        setStatus("error");
        return;
      }
      setMessage(typed.message || "Не удалось получить разбор");
      setStatus("error");
    }
  }

  // B395: убраны кнопки «Сохранить / Экспорт / Удалить исходник / Удалить
  // разбор» — разбор автосохраняется в Дневник при генерации (route.ts), а
  // удаление/скрытие живёт в самом Дневнике. Поэтому saveReport/deleteSource/
  // deleteReport больше не нужны на экране результата.

  // B330: "Начать новый разбор" — clear local form state and go to input
  // tab. We deliberately do NOT delete the saved result from the cabinet;
  // it stays in the diary. The entitlement is also dropped from local state
  // so the next analysis triggers a fresh purchase / credit deduction.
  function startNewAnalysis() {
    setResult(null);
    setHasEntitlement(false);
    setSourceText("");
    setAttachments([]);
    setContact(null);
    setEmotion(null);
    setGoal("");
    setMessage(null);
    setStatus("idle");
    setTab("input");
  }

  const parsed: ChatAnalysisStructured | null = result?.resultText
    ? tryParseChatAnalysis(result.resultText)
    : null;

  // B395: рекомендация следующего шага зависит от собранного контекста
  // (кто собеседник / что чувствуете). Считается единой системой рекомендаций.
  const recommendation = getNextStepRecommendation("chat-analysis", { contact, emotion });

  // B395: кнопки «что вы сейчас чувствуете» наполняются динамически — из тонов,
  // которые ИИ считал в диалоге (ваш тон, приходит в metadata.suggestedEmotions
  // на шаге предпросмотра). Фолбэк на статический список, если их нет.
  const emotionOptions = result?.metadata?.suggestedEmotions?.length
    ? result.metadata.suggestedEmotions
    : EMOTIONS;

  // B395: компактный одно-рядный степпер (раньше — pills с переносом на мобиле).
  // Кружок-индекс + короткая подпись, связаны гибкой тонкой линией; три шага
  // всегда в один ряд и не переносятся (flex без wrap, whitespace-nowrap).
  const steps = [
    { key: "input", label: "Переписка" },
    { key: "context", label: "Контекст" },
    { key: "result", label: "Разбор" },
  ] as const;
  const currentIndex = steps.findIndex((s) => s.key === tab);
  const stepper = (
    <div className="mb-5 flex items-center gap-2" data-testid="chat-analysis-steps">
      {steps.map((s, i) => {
        const state = i < currentIndex ? "done" : i === currentIndex ? "active" : "todo";
        const reachable = s.key === "input" || (s.key === "context" && Boolean(result)) || (s.key === "result" && Boolean(result?.resultText));
        return (
          <Fragment key={s.key}>
            <button
              type="button"
              disabled={!reachable}
              onClick={() => { if (reachable) setTab(s.key); }}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap ${reachable ? "" : "cursor-not-allowed"}`}
            >
              <span
                className={`inline-flex size-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                  state === "active"
                    ? "bg-[var(--soft-bordeaux)] text-[#FBF0E1]"
                    : state === "done"
                      ? "bg-[var(--soft-paper-deep)] text-[var(--soft-bordeaux)]"
                      : "border border-[var(--soft-paper-edge)] text-[var(--soft-ink-faint)]"
                }`}
              >
                {state === "done" ? <Check className="size-3" aria-hidden="true" /> : i + 1}
              </span>
              <span className={`text-[12.5px] font-medium ${state === "todo" ? "text-[var(--soft-ink-faint)]" : "text-[var(--soft-ink)]"}`}>
                {s.label}
              </span>
            </button>
            {i < steps.length - 1 && <span className="h-px flex-1 bg-[var(--soft-paper-edge)]" />}
          </Fragment>
        );
      })}
    </div>
  );

  return (
    <div data-testid="chat-analysis-actions">
      {tab !== "input" && stepper}

      {message && (
        <p className="mb-4 rounded-2xl bg-[var(--soft-paper-deep)] p-3 text-sm text-[var(--soft-bordeaux)]">
          {message}
        </p>
      )}

      {/* tab 1: input — modern «composer» surface (single frame, no card-in-card):
          textarea + a bottom toolbar with icon attach actions on the left and the
          primary action on the right, so the CTA always stays on the first screen. */}
      {tab === "input" && (
        <div data-testid="chat-analysis-input">
          <div className="soft-card overflow-hidden p-0 transition-colors focus-within:border-[var(--soft-bordeaux)]">
            <textarea
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              placeholder={"Вставьте переписку или приложите скриншоты — можно частями. Чем больше контекста, тем точнее разбор."}
              className="soft-question-input"
              style={{ padding: "1.1rem 1.25rem 0.6rem" }}
              rows={5}
              disabled={status === "loading"}
              data-testid="chat-analysis-textarea"
            />

            {/* Attachments as uniform micro-thumbnails (image preview / file chip)
                with a tappable × to remove. Sized small + names truncated so many
                files fit; row-gap leaves room for the × when they wrap. */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-x-2.5 gap-y-3 px-4 pb-3 pt-1" data-testid="chat-analysis-file-list">
                {attachments.map((att) => (
                  <div key={att.id} className="relative">
                    {att.kind === "image" && att.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={att.url}
                        alt={att.name}
                        className="size-12 rounded-lg border border-[var(--soft-paper-edge)] object-cover"
                      />
                    ) : (
                      <div className="flex h-12 max-w-[8.5rem] items-center gap-1.5 rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] px-2.5">
                        <FileText className="size-4 shrink-0 text-[var(--soft-ink-soft)]" aria-hidden="true" />
                        <span className="truncate text-[11px] text-[var(--soft-ink-soft)]">{att.name}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => removeAttachment(att.id)}
                      aria-label={`Удалить ${att.name}`}
                      className="absolute -right-1.5 -top-1.5 inline-flex size-5 items-center justify-center rounded-full bg-[var(--soft-bordeaux)] text-[#fff8f1] shadow-sm transition hover:brightness-110"
                    >
                      <X className="size-3" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Toolbar: attach actions (icons) + primary action. Order: screenshots → paste → «Загрузить файл» last. */}
            <div className="flex items-center justify-between gap-2 border-t border-[var(--soft-paper-edge)] px-2.5 py-2">
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => screenshotInputRef.current?.click()}
                  disabled={status === "loading"}
                  title="Скриншоты переписки"
                  aria-label="Загрузить скриншоты"
                  className="inline-flex size-9 items-center justify-center rounded-full text-[var(--soft-ink-soft)] transition-colors hover:bg-[var(--soft-paper-deep)] hover:text-[var(--soft-bordeaux)] disabled:cursor-not-allowed disabled:opacity-40"
                  data-testid="chat-analysis-upload-screenshot"
                >
                  <ImageIcon className="size-[18px]" aria-hidden="true" />
                </button>
                <input
                  ref={screenshotInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  className="sr-only"
                  disabled={status === "loading"}
                  onChange={(e) => {
                    void uploadScreenshots(e.target.files);
                    e.currentTarget.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => void pasteFromClipboard()}
                  disabled={status === "loading"}
                  title="Вставить из буфера обмена"
                  aria-label="Вставить из буфера обмена"
                  className="inline-flex size-9 items-center justify-center rounded-full text-[var(--soft-ink-soft)] transition-colors hover:bg-[var(--soft-paper-deep)] hover:text-[var(--soft-bordeaux)] disabled:cursor-not-allowed disabled:opacity-40"
                  data-testid="chat-analysis-upload-paste"
                >
                  <ClipboardPaste className="size-[18px]" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={status === "loading"}
                  title="Загрузить файл (.txt, экспорт из Telegram)"
                  aria-label="Загрузить файл"
                  className="inline-flex size-9 items-center justify-center rounded-full text-[var(--soft-ink-soft)] transition-colors hover:bg-[var(--soft-paper-deep)] hover:text-[var(--soft-bordeaux)] disabled:cursor-not-allowed disabled:opacity-40"
                  data-testid="chat-analysis-upload-file"
                >
                  <FileText className="size-[18px]" aria-hidden="true" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.html,.json,text/plain,text/html,application/json"
                  className="sr-only"
                  disabled={status === "loading"}
                  onChange={(e) => {
                    void uploadTextFile(e.target.files?.[0] ?? null);
                    e.currentTarget.value = "";
                  }}
                />
              </div>

              <Button
                onClick={proceedToContext}
                disabled={status === "loading" || sourceText.trim().length < 10}
                className="soft-button soft-button-primary"
                style={{ minHeight: "2.5rem", padding: "0 1.1rem" }}
              >
                Начать разбор
                {status === "loading" ? (
                  <IosSpinner className="size-4" />
                ) : (
                  <ArrowRight className="size-4" aria-hidden="true" />
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* tab 2: context — два РАЗНЫХ визуальных блока: тёплый «первый взгляд»
          (предпросмотр) и отдельная карточка-форма сбора контекста, чтобы форма
          не сливалась с предпросмотром. Компактно — помещается на мобиле. */}
      {tab === "context" && (
        <div className="mt-4 flex flex-col gap-3" data-testid="chat-analysis-context">
          {/* распознанный текст со скриншота — тихий сворачиваемый блок */}
          {result?.metadata?.sourceKind === "screenshot" && result.metadata?.recognizedText && (
            <details className="rounded-2xl border border-[var(--soft-paper-edge)] bg-[var(--soft-paper)] px-4 py-2.5">
              <summary className="cursor-pointer select-none text-[13px] font-medium text-[var(--soft-ink-soft)]">
                Распознанный текст
              </summary>
              <p className="mt-2 max-h-36 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-[var(--soft-ink)]">
                {result.metadata.recognizedText}
              </p>
            </details>
          )}

          {/* первый взгляд — тёплая панель-предпросмотр (бывш. «Начало разбора»).
              Компактная: меньше отступы/кегль, плотные списки — без потери текста. */}
          {result?.previewText && !result.resultText && (
            <div className="rounded-[18px] px-4 py-3" style={{ background: "var(--soft-paper-warm)" }}>
              <p className="soft-eyebrow text-[var(--soft-terracotta-dark)]">первый взгляд</p>
              <div className="mt-1.5 text-[13px] leading-relaxed text-[var(--soft-ink)] [&_p]:m-0 [&_ul]:my-1 [&_ul]:pl-4 [&_li]:my-0">
                <SoftMarkdown content={result.previewText} />
              </div>
            </div>
          )}

          {/* карточка-форма сбора контекста — отдельная поверхность, единый заголовок */}
          <div className="soft-card p-4">
            <p className="font-heading text-[1.04rem] text-[var(--soft-ink-strong)]">Контекст для точного разбора</p>

            <div className="mt-3.5 flex flex-col gap-3.5">
              <div>
                <label className="text-[13px] font-medium text-[var(--soft-ink-soft)]">Кто собеседник?</label>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {CONTACTS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setContact(contact === c ? null : c)}
                      className={`rounded-full px-2.5 py-1 text-[12.5px] transition ${
                        contact === c
                          ? "bg-[var(--soft-bordeaux)] text-[#FBF0E1]"
                          : "bg-[var(--soft-paper-deep)] text-[var(--soft-ink-soft)] hover:bg-[var(--soft-paper-edge)]"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[13px] font-medium text-[var(--soft-ink-soft)]">Что вы сейчас чувствуете?</label>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {emotionOptions.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => setEmotion(emotion === e ? null : e)}
                      className={`rounded-full px-2.5 py-1 text-[12.5px] transition ${
                        emotion === e
                          ? "bg-[var(--soft-bordeaux)] text-[#FBF0E1]"
                          : "bg-[var(--soft-paper-deep)] text-[var(--soft-ink-soft)] hover:bg-[var(--soft-paper-edge)]"
                      }`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[13px] font-medium text-[var(--soft-ink-soft)]">Что хочется получить от разбора?</label>
                <textarea
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="Понять, почему меня это так задевает. И как ответить, чтобы не было хуже."
                  className="soft-question-input mt-2"
                  rows={2}
                />
              </div>
            </div>

            {/* #7: оплата — единственное основное действие (баллы/карта → полный
                разбор в один клик). Оплата живёт здесь, внутри итога. */}
            {hasEntitlement ? (
              <Button
                onClick={generateReport}
                disabled={status === "loading" || status === "paying"}
                className="soft-button soft-button-primary mt-5 w-full justify-center"
              >
                <LockKeyhole className="size-4" aria-hidden="true" />
                Показать полный разбор
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            ) : (
              <div className="mt-5">
                <ProductPurchaseControls
                  productKey="chat-analysis"
                  label="Открыть полный разбор"
                  checkoutSource="chat-analysis-generate"
                  creditCost={2}
                  onUnlocked={() => {
                    setHasEntitlement(true);
                    void generateReport();
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* tab 3: result */}
      {tab === "result" && result && (
        <>
          {parsed ? (
            <StructuredResult
              data={parsed}
              recommendation={recommendation}
              onStartNew={startNewAnalysis}
              loading={status === "loading"}
            />
          ) : (
            <SoftMarkdown
              content={result.resultText}
              className="soft-card mt-4 p-5 font-heading text-[1.08rem] text-[var(--soft-ink)]"
            />
          )}
        </>
      )}
    </div>
  );
}
