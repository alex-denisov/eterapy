"use client";

import { useState } from "react";
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
  const [sharing, setSharing] = useState(false);
  const [saved, setSaved] = useState(false);

  const emoji = TOOL_EMOJIS[tool] ?? "✦";
  const label = TOOL_LABELS[tool] ?? tool;
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://eterapy.com";

  /** Сохраняем в историю AI */
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

  /** Поделиться в Telegram */
  async function shareToTelegram() {
    setSharing(true);
    await saveToHistory();

    const preview = resultText.slice(0, 200).replace(/\n/g, " ");
    const text = `${emoji} ${label} на ETerapy\n\n${preview}...\n\nПопробуй сам: ${APP_URL}/tools`;
    const url = `https://t.me/share/url?url=${encodeURIComponent(APP_URL + "/tools")}&text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setSharing(false);
    toast.success("Ссылка для Telegram открыта!");
  }

  /** Поделиться в VK */
  async function shareToVK() {
    setSharing(true);
    await saveToHistory();

    const preview = resultText.slice(0, 200);
    const url = `https://vk.com/share.php?url=${encodeURIComponent(APP_URL + "/tools")}&title=${encodeURIComponent(`${emoji} ${label}`)}&description=${encodeURIComponent(preview)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setSharing(false);
  }

  /** Скопировать текст */
  async function copyResult() {
    await saveToHistory();
    await navigator.clipboard.writeText(`${emoji} ${label}\n\n${resultText}\n\n— ETerapy: ${APP_URL}/tools`);
    toast.success("Скопировано в буфер обмена");
  }

  return (
    <div className="flex items-center gap-2 flex-wrap mt-4 pt-4 border-t border-border/20">
      <span className="text-xs text-muted-foreground mr-1">Поделиться:</span>

      {/* Telegram */}
      <button onClick={shareToTelegram} disabled={sharing}
        className="flex items-center gap-1.5 rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-1.5 text-xs text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.247l-1.97 9.289c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L6.065 14.5l-2.974-.924c-.646-.204-.659-.646.136-.958l11.59-4.47c.538-.194 1.009.131.745.099z"/>
        </svg>
        Telegram
      </button>

      {/* VK */}
      <button onClick={shareToVK} disabled={sharing}
        className="flex items-center gap-1.5 rounded-lg border border-[#0077FF]/20 bg-[#0077FF]/10 px-3 py-1.5 text-xs text-[#4da3ff] hover:bg-[#0077FF]/20 transition-colors disabled:opacity-50">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" xmlns="http://www.w3.org/2000/svg">
          <path d="M13.162 18.994c.609 0 .858-.406.851-1.008-.03-1.765 1.01-2.701 1.01-2.701s1.378 1.945 2.047 2.843c.465.628.863.866 1.5.866h2.462c.756 0 .997-.343.747-.961-.267-.617-.963-1.61-1.882-2.619-1.18-1.367-1.208-1.425-.34-2.717.851-1.263 2.395-3.398 2.395-3.398.465-.718.24-1.148-.628-1.148h-2.462c-.703 0-.992.375-1.214.849-1.02 2.013-2.85 4.099-3.548 3.638-.673-.43-.518-2.19-.518-2.19 0-2.252.643-3.198-.624-3.5-1.113-.252-1.977-.27-3.092-.027-1.42.317-1.5 1.196-.84 1.298.852.14 1.126.69 1.183 1.637.153 2.44-.464 3.47-1.174 3.068-1.06-.607-2.297-3.003-3.25-5.407-.253-.646-.583-.857-1.255-.857H2.69c-.756 0-.998.408-.748 1.001 2.302 5.45 5.012 8.742 9.213 8.742l1.007-.01z"/>
        </svg>
        ВКонтакте
      </button>

      {/* Копировать */}
      <button onClick={copyResult}
        className="flex items-center gap-1.5 rounded-lg border border-border/30 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
        📋 Копировать
      </button>

      {/* Сохранить */}
      <button onClick={saveToHistory} disabled={saved}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
          saved
            ? "border-green-500/30 text-green-400 cursor-default"
            : "border-border/30 text-muted-foreground hover:text-foreground"
        }`}>
        {saved ? "✓ Сохранено" : "🗂️ Сохранить"}
      </button>
    </div>
  );
}
