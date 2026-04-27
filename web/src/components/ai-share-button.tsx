"use client";

import { useState, useRef, useEffect, useCallback } from "react";
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

interface ShareOption {
  id: string;
  label: string;
  icon: React.ReactNode;
  color?: string;
}

const SHARE_OPTIONS: ShareOption[] = [
  {
    id: "telegram",
    label: "Telegram",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.247l-1.97 9.289c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L6.065 14.5l-2.974-.924c-.646-.204-.659-.646.136-.958l11.59-4.47c.538-.194 1.009.131.745.099z"/>
      </svg>
    ),
    color: "#2AABEE",
  },
  {
    id: "vk",
    label: "ВКонтакте",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
        <path d="M13.162 18.994c.609 0 .858-.406.851-1.008-.03-1.765 1.01-2.701 1.01-2.701s1.378 1.945 2.047 2.843c.465.628.863.866 1.5.866h2.462c.756 0 .997-.343.747-.961-.267-.617-.963-1.61-1.882-2.619-1.18-1.367-1.208-1.425-.34-2.717.851-1.263 2.395-3.398 2.395-3.398.465-.718.24-1.148-.628-1.148h-2.462c-.703 0-.992.375-1.214.849-1.02 2.013-2.85 4.099-3.548 3.638-.673-.43-.518-2.19-.518-2.19 0-2.252.643-3.198-.624-3.5-1.113-.252-1.977-.27-3.092-.027-1.42.317-1.5 1.196-.84 1.298.852.14 1.126.69 1.183 1.637.153 2.44-.464 3.47-1.174 3.068-1.06-.607-2.297-3.003-3.25-5.407-.253-.646-.583-.857-1.255-.857H2.69c-.756 0-.998.408-.748 1.001 2.302 5.45 5.012 8.742 9.213 8.742l1.007-.01z"/>
      </svg>
    ),
    color: "#0077FF",
  },
  {
    id: "copy",
    label: "Копировать результат",
    icon: <Copy className="h-4 w-4" />,
  },
  {
    id: "link",
    label: "Скопировать ссылку",
    icon: <Link className="h-4 w-4" />,
  },
  {
    id: "download",
    label: "Скачать результат",
    icon: <Download className="h-4 w-4" />,
  },
];

export function AIShareButton({ tool, title, resultText, onSaved }: AIShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [saved, setSaved] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close popover on outside click
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
      if (d.id) { setSaved(true); onSaved?.(d.id); }
    } catch { /* non-critical */ }
  }

  async function shareToTelegram() {
    setSharing(true);
    await saveToHistory();
    const emoji = TOOL_EMOJIS[tool] ?? "✦";
    const label = TOOL_LABELS[tool] ?? tool;
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://eterapy.com";
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
    const emoji = TOOL_EMOJIS[tool] ?? "✦";
    const label = TOOL_LABELS[tool] ?? tool;
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://eterapy.com";
    const preview = resultText.slice(0, 200);
    const url = `https://vk.com/share.php?url=${encodeURIComponent(APP_URL + "/all-modalities")}&title=${encodeURIComponent(`${emoji} ${label}`)}&description=${encodeURIComponent(preview)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setSharing(false);
    setOpen(false);
  }

  async function copyResult() {
    await saveToHistory();
    const emoji = TOOL_EMOJIS[tool] ?? "✦";
    const label = TOOL_LABELS[tool] ?? tool;
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://eterapy.com";
    await navigator.clipboard.writeText(`${emoji} ${label}\n\n${resultText}\n\n— ETerapy: ${APP_URL}/modalities`);
    setOpen(false);
    toast.success("Скопировано в буфер обмена");
  }

  async function copyLink() {
    await saveToHistory();
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://eterapy.com";
    await navigator.clipboard.writeText(`${APP_URL}/tools/${tool.toLowerCase()}`);
    setOpen(false);
    toast.success("Ссылка скопирована");
  }

  async function downloadResult() {
    await saveToHistory();
    const emoji = TOOL_EMOJIS[tool] ?? "✦";
    const label = TOOL_LABELS[tool] ?? tool;
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://eterapy.com";
    const blob = new Blob([`${emoji} ${label}\n${title}\n\n${resultText}\n\n— ETerapy: ${APP_URL}`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // eslint-disable-next-line react-hooks/purity -- Event handler output filename, not render state.
    a.download = `${tool.toLowerCase()}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setOpen(false);
    toast.success("Файл скачан");
  }

  const handleAction = async (id: string) => {
    switch (id) {
      case "telegram": await shareToTelegram(); break;
      case "vk": await shareToVK(); break;
      case "copy": await copyResult(); break;
      case "link": await copyLink(); break;
      case "download": await downloadResult(); break;
    }
  };

  const emoji = TOOL_EMOJIS[tool] ?? "✦";

  return (
    <div className="relative mt-6 pt-5 border-t border-border/30">
      <div className="flex items-center justify-end gap-3">
        {saved && (
          <span className="flex items-center gap-1 text-xs text-emerald-400/90">
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Сохранено
          </span>
        )}

        <div className="relative">
          {/* Trigger button */}
          <button
            ref={triggerRef}
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-haspopup="true"
            aria-label="Поделиться результатом"
            className="group flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20 transition-all duration-200 hover:bg-primary/15 hover:shadow-lg hover:shadow-primary/10 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:scale-95"
          >
            <Share2 className="h-4 w-4 transition-transform duration-200 group-hover:rotate-12" />
          </button>

          {/* Tooltip — CSS only, no hydration issues */}
          <div
            className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-lg opacity-0 ring-1 ring-border/50 transition-opacity duration-150 group-hover:opacity-100"
            role="tooltip"
          >
            Поделиться
            {/* Arrow */}
            <div className="absolute left-1/2 top-full -translate-x-1/2 -mt-px">
              <div className="h-0 w-0 border-l-[5px] border-r-[5px] border-t-[5px] border-l-transparent border-r-transparent border-t-popover" />
            </div>
          </div>

          {/* Popover */}
          {open && (
            <div
              ref={popoverRef}
              role="menu"
              aria-orientation="vertical"
              className="absolute right-0 bottom-full mb-2 w-60 origin-bottom-right rounded-xl border border-border/40 bg-popover p-1.5 text-popover-foreground shadow-2xl shadow-black/30 ring-1 ring-black/10"
              style={{
                animation: "popoverIn 200ms ease-out both",
              }}
            >
              {/* Header */}
              <div className="mb-1 px-2.5 py-1.5">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                  {emoji} Поделиться результатом
                </p>
              </div>

              {/* Divider */}
              <div className="my-1 h-px bg-border/50" />

              {/* Options */}
              {SHARE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  role="menuitem"
                  onClick={() => handleAction(option.id)}
                  disabled={sharing}
                  className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-foreground/80 transition-colors duration-150 hover:bg-accent/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-40 active:bg-accent"
                >
                  <span style={option.color ? { color: option.color } : undefined} className="text-muted-foreground">
                    {option.icon}
                  </span>
                  <span>{option.label}</span>
                </button>
              ))}

              {/* Arrow */}
              <div className="absolute left-full top-4 -ml-px hidden lg:block">
                <div className="h-0 w-0 border-t-[6px] border-b-[6px] border-l-[6px] border-t-transparent border-b-transparent border-l-popover" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
