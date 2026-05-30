"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Link as LinkIcon, Share2 } from "lucide-react";
import { toast } from "sonner";
import { SoftHaloMark } from "@/components/brand/brand-mark";
import { APP_URL } from "@/lib/env";

interface AIShareButtonProps {
  tool: string;
  title: string;
  resultText: string;
  onSaved?: (id: string) => void;
  inline?: boolean;
}

const TOOL_LABELS: Record<string, string> = {
  TAROT: "Расклад таро",
  CHECKIN: "Диалог ясности",
  NATAL: "Натальная карта",
  NUMEROLOGY: "Нумерология",
  HOROSCOPE: "Гороскоп",
  GUIDE: "Личный гид",
};

const TEMPLATES = [
  {
    name: "Заря",
    style: "linear-gradient(160deg, #F4D9C1 0%, #E8C4B8 54%, #DBD3EA 100%)",
    ink: "#5C2A2C",
    muted: "rgba(92,42,44,0.62)",
  },
  {
    name: "Полдень",
    style: "linear-gradient(160deg, #FFF6D6 0%, #F4D9C1 64%, #E8C4B8 100%)",
    ink: "#5C2A2C",
    muted: "rgba(92,42,44,0.62)",
  },
  {
    name: "Сумерки",
    style: "linear-gradient(160deg, #5C2A2C 0%, #A89BC9 100%)",
    ink: "#FBF0E1",
    muted: "rgba(251,240,225,0.7)",
  },
  {
    name: "Глубина",
    style: "linear-gradient(160deg, #2A2422 0%, #5C2A2C 100%)",
    ink: "#F4D9C1",
    muted: "rgba(244,217,193,0.7)",
  },
];

function appOrigin() {
  return APP_URL;
}

function insightPreview(resultText: string) {
  const clean = resultText.replace(/\s+/g, " ").trim();
  if (!clean) return "Я могу остановиться, услышать себя и выбрать следующий маленький шаг.";
  return clean.length > 154 ? `${clean.slice(0, 154).trim()}...` : clean;
}

function shareLandingUrl(tool: string) {
  const label = encodeURIComponent(TOOL_LABELS[tool] ?? tool);
  return `${appOrigin()}/share?from=${encodeURIComponent(tool.toLowerCase())}&topic=${label}`;
}

export function AIShareButton({ tool, title, resultText, onSaved, inline }: AIShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [templateIndex, setTemplateIndex] = useState(0);
  const [hideQuestion, setHideQuestion] = useState(true);
  const [showWatermark, setShowWatermark] = useState(true);
  const shareKey = useMemo(
    () => JSON.stringify({ hideQuestion, showWatermark, resultText, tool }),
    [hideQuestion, showWatermark, resultText, tool],
  );
  const [durableShare, setDurableShare] = useState<{ key: string; url: string } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const handleClose = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        handleClose();
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open, handleClose]);

  async function saveToHistory() {
    if (saved) return;
    try {
      const res = await fetch("/api/modalities/history/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool, title, result: resultText }),
      });
      const d = await res.json();
      if (d.id) {
        setSaved(true);
        onSaved?.(d.id);
      }
    } catch {
      // Share still works when history save is unavailable.
    }
  }

  async function ensureShareUrl() {
    if (durableShare?.key === shareKey) return durableShare.url;
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType: tool.toLowerCase(),
          sourceLabel: TOOL_LABELS[tool] ?? tool,
          topic: TOOL_LABELS[tool] ?? tool,
          previewText: insightPreview(resultText),
          hideQuestion,
          showWatermark,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.share?.url) {
        setDurableShare({ key: shareKey, url: data.share.url });
        return data.share.url as string;
      }
    } catch {
      // Static share fallback keeps the UI usable if attribution is unavailable.
    }
    return shareLandingUrl(tool);
  }

  function publicText(url: string) {
    const label = TOOL_LABELS[tool] ?? "разбор";
    const question = hideQuestion ? "" : `\n\nМой вопрос: ${title}`;
    return `Инсайт из ETerapy (${label})${question}\n\n${insightPreview(resultText)}\n\nПопробовать бережный разбор: ${url}`;
  }

  async function copyInviteLink() {
    await saveToHistory();
    const url = await ensureShareUrl();
    await navigator.clipboard.writeText(url);
    setOpen(false);
    toast.success("Ссылка скопирована");
  }

  async function copySafeText() {
    await saveToHistory();
    const url = await ensureShareUrl();
    await navigator.clipboard.writeText(publicText(url));
    setOpen(false);
    toast.success("Обезличенный текст скопирован");
  }

  async function downloadSafeText() {
    await saveToHistory();
    const shareUrl = await ensureShareUrl();
    const blob = new Blob([publicText(shareUrl)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `eterapy-insight-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setOpen(false);
    toast.success("Обезличенный файл сохранен");
  }

  const template = TEMPLATES[templateIndex] ?? TEMPLATES[0];

  const trigger = (
    <>
      {saved && !inline && (
        <span className="text-xs text-[var(--soft-ink-faint)]">
          Сохранено в историю
        </span>
      )}
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Поделиться обезличенным инсайтом"
        className="soft-button soft-button-primary"
      >
        <Share2 className="h-4 w-4" />
        Поделиться инсайтом
      </button>
    </>
  );

  function renderModal() {
    return (
      <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-[rgba(42,36,34,0.26)] px-3 pt-20 pb-10 backdrop-blur-sm sm:px-5 sm:pt-24">
        <div
          ref={popoverRef}
          role="dialog"
          aria-modal="true"
          aria-label="Безопасная карточка для отправки"
          className="my-auto w-full max-w-[720px] rounded-[var(--soft-radius-lg)] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper)] p-4 shadow-[var(--soft-shadow-md)]"
        >
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <p className="soft-eyebrow">поделиться инсайтом</p>
              <h2 className="mt-2 font-heading text-2xl font-semibold text-[var(--soft-bordeaux)]">
                Поделиться <em className="not-italic italic">инсайтом</em>
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                По умолчанию карточка обезличена — без имени, без вопроса.
              </p>
            </div>
            <button
              onClick={handleClose}
              aria-label="Закрыть"
              className="shrink-0 rounded-full p-1 text-[var(--soft-ink-faint)] hover:text-[var(--soft-ink)]"
            >
              ✕
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_280px]">
            <div className="hidden sm:grid place-items-center rounded-[var(--soft-radius-lg)] bg-[var(--soft-paper-deep)] p-5">
              <div
                className="relative flex aspect-[4/5] w-full max-w-[280px] flex-col justify-between overflow-hidden rounded-[28px] p-7 shadow-[0_22px_70px_rgba(92,42,44,0.2)]"
                style={{ background: template.style, color: template.ink }}
              >
                <span className="pointer-events-none absolute -right-10 -top-8 h-40 w-40 rounded-full bg-white/20 blur-2xl" />
                <div className="relative z-10">
                  <div className="flex items-center gap-2" style={{ opacity: 0.85 }}>
                    <SoftHaloMark size={18} glow={false} />
                    <span className="font-heading text-lg font-semibold">ETerapy</span>
                  </div>
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: template.muted }}>
                    инсайт дня
                  </p>
                </div>

                <div className="relative z-10">
                  {!hideQuestion && (
                    <p className="mb-4 text-sm italic" style={{ color: template.muted }}>
                      «{title}»
                    </p>
                  )}
                  <p className="font-heading text-xl italic leading-snug">
                    {insightPreview(resultText)}
                  </p>
                </div>

                <div className="relative z-10 flex items-end justify-between gap-4 text-xs" style={{ color: template.muted }}>
                  <span>{showWatermark ? "eterapy.com/share" : "личная заметка"}</span>
                  <span className="font-heading text-base italic">с теплом</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <p className="soft-eyebrow">Шаблон</p>
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {TEMPLATES.map((item, index) => (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => setTemplateIndex(index)}
                      className={`h-16 rounded-2xl border transition ${index === templateIndex ? "border-[var(--soft-bordeaux)] ring-2 ring-[rgba(92,42,44,0.14)]" : "border-[var(--soft-paper-edge)]"}`}
                      style={{ background: item.style }}
                      aria-label={`Выбрать шаблон ${item.name}`}
                    />
                  ))}
                </div>
              </div>

              <div className="soft-card p-3">
                <p className="soft-eyebrow">Приватность</p>
                <label className="mt-2 flex cursor-pointer gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={hideQuestion}
                    onChange={(e) => setHideQuestion(e.target.checked)}
                    className="mt-0.5 accent-[var(--soft-terracotta)]"
                  />
                  <span className="font-medium text-[var(--soft-ink)]">Скрыть мой вопрос</span>
                </label>
                <label className="mt-2 flex cursor-pointer gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={showWatermark}
                    onChange={(e) => setShowWatermark(e.target.checked)}
                    className="mt-0.5 accent-[var(--soft-terracotta)]"
                  />
                  <span className="font-medium text-[var(--soft-ink)]">Показать водяной знак ETerapy</span>
                </label>
              </div>

              <div className="grid gap-2">
                <button onClick={copyInviteLink} className="soft-button soft-button-primary justify-center">
                  <LinkIcon className="h-4 w-4" /> Скопировать ссылку
                </button>
                <button onClick={copySafeText} className="soft-button soft-button-ghost justify-center">
                  <Copy className="h-4 w-4" /> Скопировать текст
                </button>
              </div>

              <p className="text-xs leading-relaxed text-[var(--soft-ink-faint)]">
                По умолчанию карточка обезличена — без имени, аватарки и исходного вопроса.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (inline) {
    return (
      <>
        {trigger}
        {open && renderModal()}
      </>
    );
  }

  return (
    <div className="relative mt-6 border-t border-[var(--soft-paper-edge)] pt-5" data-testid="safe-share-card">
      <div className="flex items-center justify-end gap-3">
        {saved && (
          <span className="text-xs text-[var(--soft-ink-faint)]">
            Сохранено в историю
          </span>
        )}

        <button
          ref={triggerRef}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label="Поделиться обезличенным инсайтом"
          className="soft-button soft-button-primary"
        >
          <Share2 className="h-4 w-4" />
          Поделиться инсайтом
        </button>
      </div>

      {open && renderModal()}
    </div>
  );
}
