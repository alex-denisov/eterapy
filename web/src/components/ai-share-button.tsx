"use client";

import { useState, useRef, useEffect } from "react";
import { Share2, Download, Copy, Link } from "lucide-react";
import { toast } from "sonner";

interface AIShareButtonProps {
  tool: string;
  title: string;
  resultText: string;
  /** Для сохранения в историю */
  onSaved?: (id: string) => void;
}

const TOOL_EMOJIS: Record<string, string> = {
  TAROT: "🃏", CHECKIN: "💭", NATAL: "⭐", NUMEROLOGY: "🔢", HOROSCOPE: "♈", GUIDE: "🧭",
};

const TOOL_LABELS: Record<string, string> = {
  TAROT: "Расклад таро", CHECKIN: "Рефлексия", NATAL: "Натальная карта",
  NUMEROLOGY: "Нумерология", HOROSCOPE: "Гороскоп", GUIDE: "Личный гид",
};

export function AIShareButton({ tool, title, resultText, onSaved }: AIShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const emoji = TOOL_EMOJIS[tool] ?? "✦";
  const label = TOOL_LABELS[tool] ?? tool;
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://eterapy.com";

  // Close popover on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function saveToHistory() {
    if (saved) return;
    try {
      const res = await fetch("/api/modalities/history/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool, title, result: resultText }),
      });
      const d = await res.json();
      if (d.id) { setSaved(true); onSaved?.(d.id); }
    } catch { /* non-critical */ }
  }

  async function shareToTelegram() {
    setSharing(true);
    await saveToHistory();
    const preview = resultText.slice(0, 200).replace(/\n/g, " ");
    const text = `${emoji} ${label} на ETerapy\n\n${preview}...\n\nПопробуй сам: ${APP_URL}/modalities`;
    const url = `https://t.me/share/url?url=${encodeURIComponent(APP_URL + "/all-modalities")}&text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setSharing(false);
    setOpen(false);
    toast.success("Ссылка для Telegram открыта!");
  }

  async function shareToVK() {
    setSharing(true);
    await saveToHistory();
    const preview = resultText.slice(0, 200);
    const url = `https://vk.com/share.php?url=${encodeURIComponent(APP_URL + "/all-modalities")}&title=${encodeURIComponent(`${emoji} ${label}`)}&description=${encodeURIComponent(preview)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setSharing(false);
    setOpen(false);
  }

  async function copyResult() {
    await saveToHistory();
    await navigator.clipboard.writeText(`${emoji} ${label}\\n\n${resultText}\n\n— ETerapy: ${APP_URL}/modalities`);
    setOpen(false);
    toast.success("Скопировано в буфер обмена");
  }

  async function copyLink() {
    await saveToHistory();
    await navigator.clipboard.writeText(`${APP_URL}/tools/${tool.toLowerCase()}`);
    setOpen(false);
    toast.success("Ссылка скопирована");
  }

  async function downloadResult() {
    await saveToHistory();
    const blob = new Blob([`${emoji} ${label}\n${title}\n\n${resultText}\n\n— ETerapy: ${APP_URL}`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tool.toLowerCase()}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setOpen(false);
    toast.success("Файл скачан");
  }

  return (
    <div className="relative mt-4 pt-4 border-t border-border/20" ref={ref}>
      {/* Floating Action Button */}
      <div className="flex items-center justify-end gap-2">
        {saved && mounted && (
          <span className="text-xs text-green-400 flex items-center gap-1">
            <span className="text-[10px]">✓</span> Сохранено
          </span>
        )}
        <div className="relative">
          <button
            onClick={() => setOpen(!open)}
            className="group relative flex items-center justify-center w-11 h-11 rounded-full bg-primary text-navy shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/40 hover:scale-110 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50"
            title="Поделиться результатом"
            disabled={sharing}
          >
            <Share2 className="h-5 w-5 transition-transform duration-200 group-hover:rotate-12" />
          </button>

          {/* Tooltip */}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <div className="rounded-lg bg-popover text-popover-foreground text-xs px-2.5 py-1.5 shadow-md whitespace-nowrap">
              Поделиться результатом
              <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
                <div className="border-4 border-transparent border-t-popover" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Popover — only render client-side to avoid hydration mismatch */}
      {open && mounted && (
        <div className="absolute right-0 bottom-full mb-3 w-64 rounded-xl border border-border/40 bg-popover text-popover-foreground shadow-2xl shadow-black/20 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="p-2 space-y-1">
            {/* Telegram */}
            <button
              onClick={shareToTelegram}
              disabled={sharing}
              className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-accent transition-colors disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#2AABEE]" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.247l-1.97 9.289c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L6.065 14.5l-2.974-.924c-.646-.204-.659-.646.136-.958l11.59-4.47c.538-.194 1.009.131.745.099z"/>
              </svg>
              <span>Telegram</span>
            </button>

            {/* VK */}
            <button
              onClick={shareToVK}
              disabled={sharing}
              className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-accent transition-colors disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-[#0077FF]" xmlns="http://www.w3.org/2000/svg">
                <path d="M13.162 18.994c.609 0 .858-.406.851-1.008-.03-1.765 1.01-2.701 1.01-2.701s1.378 1.945 2.047 2.843c.465.628.863.866 1.5.866h2.462c.756 0 .997-.343.747-.961-.267-.617-.963-1.61-1.882-2.619-1.18-1.367-1.208-1.425-.34-2.717.851-1.263 2.395-3.398 2.395-3.398.465-.718.24-1.148-.628-1.148h-2.462c-.703 0-.992.375-1.214.849-1.02 2.013-2.85 4.099-3.548 3.638-.673-.43-.518-2.19-.518-2.19 0-2.252.643-3.198-.624-3.5-1.113-.252-1.977-.27-3.092-.027-1.42.317-1.5 1.196-.84 1.298.852.14 1.126.69 1.183 1.637.153 2.44-.464 3.47-1.174 3.068-1.06-.607-2.297-3.003-3.25-5.407-.253-.646-.583-.857-1.255-.857H2.69c-.756 0-.998.408-.748 1.001 2.302 5.45 5.012 8.742 9.213 8.742l1.007-.01z"/>
              </svg>
              <span>ВКонтакте</span>
            </button>

            {/* Копировать результат */}
            <button
              onClick={copyResult}
              className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-accent transition-colors"
            >
              <Copy className="h-4 w-4 text-muted-foreground" />
              <span>Копировать результат</span>
            </button>

            {/* Скопировать ссылку */}
            <button
              onClick={copyLink}
              className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-accent transition-colors"
            >
              <Link className="h-4 w-4 text-muted-foreground" />
              <span>Скопировать ссылку</span>
            </button>

            {/* Скачать */}
            <button
              onClick={downloadResult}
              className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-accent transition-colors"
            >
              <Download className="h-4 w-4 text-muted-foreground" />
              <span>Скачать результат</span>
            </button>
          </div>

          {/* Chevron */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
            <div className="border-8 border-transparent border-t-popover" />
          </div>
        </div>
      )}
    </div>
  );
}
