"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Download, Link as LinkIcon, Send, Share2 } from "lucide-react";
import { toast } from "sonner";

interface AIShareButtonProps {
  tool: string;
  title: string;
  resultText: string;
  onSaved?: (id: string) => void;
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
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://eterapy.com";
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

export function AIShareButton({ tool, title, resultText, onSaved }: AIShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [templateIndex, setTemplateIndex] = useState(0);
  const [hideQuestion, setHideQuestion] = useState(true);
  const [showWatermark, setShowWatermark] = useState(true);
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

  function publicText() {
    const label = TOOL_LABELS[tool] ?? "разбор";
    const question = hideQuestion ? "" : `\n\nМой вопрос: ${title}`;
    return `Инсайт из ETerapy (${label})${question}\n\n${insightPreview(resultText)}\n\nПопробовать бережный разбор: ${shareLandingUrl(tool)}`;
  }

  async function copyInviteLink() {
    await saveToHistory();
    await navigator.clipboard.writeText(shareLandingUrl(tool));
    setOpen(false);
    toast.success("Ссылка скопирована");
  }

  async function copySafeText() {
    await saveToHistory();
    await navigator.clipboard.writeText(publicText());
    setOpen(false);
    toast.success("Обезличенный текст скопирован");
  }

  async function shareToTelegram() {
    setSharing(true);
    await saveToHistory();
    const url = `https://t.me/share/url?url=${encodeURIComponent(shareLandingUrl(tool))}&text=${encodeURIComponent(publicText())}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setSharing(false);
    setOpen(false);
    toast.success("Открыта безопасная отправка в Telegram");
  }

  async function shareToVK() {
    setSharing(true);
    await saveToHistory();
    const url = `https://vk.com/share.php?url=${encodeURIComponent(shareLandingUrl(tool))}&title=${encodeURIComponent("ETerapy: инсайт дня")}&description=${encodeURIComponent(insightPreview(resultText))}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setSharing(false);
    setOpen(false);
  }

  async function downloadSafeText() {
    await saveToHistory();
    const blob = new Blob([publicText()], { type: "text/plain;charset=utf-8" });
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
          Поделиться
        </button>
      </div>

      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Безопасная карточка для отправки"
          className="absolute right-0 z-50 mt-3 w-[min(92vw,720px)] rounded-[var(--soft-radius-lg)] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper)] p-4 shadow-[var(--soft-shadow-md)]"
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="grid place-items-center rounded-[var(--soft-radius-lg)] bg-[var(--soft-paper-deep)] p-5">
              <div
                className="relative flex aspect-[4/5] w-full max-w-[320px] flex-col justify-between overflow-hidden rounded-[28px] p-7 shadow-[0_22px_70px_rgba(92,42,44,0.2)]"
                style={{ background: template.style, color: template.ink }}
              >
                <span className="pointer-events-none absolute -right-10 -top-8 h-40 w-40 rounded-full bg-white/20 blur-2xl" />
                <div className="relative z-10">
                  <div className="flex items-center gap-2">
                    <span className="h-4 w-4 rounded-full border-2 border-current" />
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
                  <p className="font-heading text-2xl italic leading-snug">
                    {insightPreview(resultText)}
                  </p>
                </div>

                <div className="relative z-10 flex items-end justify-between gap-4 text-xs" style={{ color: template.muted }}>
                  <span>{showWatermark ? "eterapy.com/share" : "личная заметка"}</span>
                  <span className="font-heading text-lg italic">с теплом</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <p className="premium-eyebrow">Шаблон</p>
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {TEMPLATES.map((item, index) => (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => setTemplateIndex(index)}
                      className={`h-20 rounded-2xl border transition ${index === templateIndex ? "border-[var(--soft-bordeaux)] ring-2 ring-[rgba(92,42,44,0.14)]" : "border-[var(--soft-paper-edge)]"}`}
                      style={{ background: item.style }}
                      aria-label={`Выбрать шаблон ${item.name}`}
                    />
                  ))}
                </div>
              </div>

              <div className="soft-card p-4">
                <p className="premium-eyebrow">Приватность</p>
                <label className="mt-3 flex cursor-pointer gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={hideQuestion}
                    onChange={(e) => setHideQuestion(e.target.checked)}
                    className="mt-1 accent-[var(--soft-terracotta)]"
                  />
                  <span>
                    <span className="block font-medium text-[var(--soft-ink)]">Скрыть мой вопрос</span>
                    <span className="text-[var(--soft-ink-faint)]">Включено по умолчанию: карточка без имени, аватарки и исходного вопроса.</span>
                  </span>
                </label>
                <label className="mt-3 flex cursor-pointer gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={showWatermark}
                    onChange={(e) => setShowWatermark(e.target.checked)}
                    className="mt-1 accent-[var(--soft-terracotta)]"
                  />
                  <span>
                    <span className="block font-medium text-[var(--soft-ink)]">Показать водяной знак ETerapy</span>
                    <span className="text-[var(--soft-ink-faint)]">Ссылка ведет на короткую страницу-приглашение.</span>
                  </span>
                </label>
              </div>

              <div className="grid gap-2">
                <button onClick={shareToTelegram} disabled={sharing} className="soft-button soft-button-primary justify-center">
                  <Send className="h-4 w-4" /> Telegram
                </button>
                <button onClick={shareToVK} disabled={sharing} className="soft-button soft-button-ghost justify-center">
                  <Share2 className="h-4 w-4" /> ВКонтакте
                </button>
                <button onClick={copySafeText} className="soft-button soft-button-ghost justify-center">
                  <Copy className="h-4 w-4" /> Скопировать текст
                </button>
                <button onClick={copyInviteLink} className="soft-button soft-button-ghost justify-center">
                  <LinkIcon className="h-4 w-4" /> Скопировать ссылку
                </button>
                <button onClick={downloadSafeText} className="soft-button soft-button-ghost justify-center">
                  <Download className="h-4 w-4" /> Сохранить файл
                </button>
              </div>

              <p className="text-xs leading-relaxed text-[var(--soft-ink-faint)]">
                По умолчанию мы не добавляем имя, email, аватар, приватный профиль или полный текст вопроса.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
