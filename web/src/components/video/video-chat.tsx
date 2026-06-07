"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";

interface ChatMsg {
  id: string;
  senderId: string;
  sender: { id: string; name: string };
  text: string | null;
  fileUrl: string | null;
  fileName: string | null;
  fileMime: string | null;
  createdAt: string;
}

// Палитра цветов для участников
const COLORS = ["text-primary", "text-blue-400", "text-purple-400", "text-green-400"];
function getColor(id: string) { return COLORS[id.charCodeAt(0) % COLORS.length]; }

// Базовый набор смайлов
const EMOJIS = ["😊","😂","🙏","❤️","👍","✨","🌸","💫","🔮","⭐","🌙","💬","😌","🤔","💡","🙌","😔","🌿","🕊️","💎"];

interface VideoChatProps {
  videoSessionId: string | null;
  participantName: string;
  role: "client" | "practitioner";
}

export function VideoChat({ videoSessionId, participantName }: VideoChatProps) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Загружаем историю
  useEffect(() => {
    if (!videoSessionId) return;
    fetch(`/api/video/chat?videoSessionId=${videoSessionId}`)
      .then(r => r.json())
      .then(d => { if (d.messages) setMessages(d.messages); });
  }, [videoSessionId]);

  // Скролл вниз при новых сообщениях
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async (msgText: string) => {
    if (!videoSessionId || !msgText.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/video/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoSessionId, text: msgText.trim() }),
      });
      const d = await res.json();
      if (d.ok) {
        setMessages(prev => [...prev, d.message]);
        setText("");
      } else {
        toast.error(d.error ?? "Ошибка");
      }
    } catch { toast.error("Ошибка сети"); }
    finally { setSending(false); }
  }, [videoSessionId]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(text);
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !videoSessionId) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("videoSessionId", videoSessionId);
      fd.append("file", file);
      const res = await fetch("/api/video/chat", { method: "POST", body: fd });
      const d = await res.json();
      if (d.ok) {
        setMessages(prev => [...prev, d.message]);
      } else {
        toast.error(d.error ?? "Ошибка загрузки");
      }
    } catch { toast.error("Ошибка сети"); }
    finally { setUploading(false); e.target.value = ""; }
  }

  function isImage(mime: string | null) { return mime?.startsWith("image/"); }
  function isAudio(mime: string | null) { return mime?.startsWith("audio/"); }

  return (
    <div className="flex flex-col h-full">
      {/* Заголовок */}
      <div className="px-4 py-3 border-b border-white/10">
        <p className="text-sm font-semibold">Чат сессии</p>
        <p className="text-xs text-muted-foreground">История сохранится в кабинете</p>
      </div>

      {/* Сообщения */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-center text-xs text-muted-foreground/60 mt-8">Начните общение</p>
        )}
        {messages.map((m) => {
          const isMe = m.sender.name === participantName;
          const color = getColor(m.senderId);
          return (
            <div key={m.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
              <span className={`text-[11px] font-medium mb-1 ${color}`}>{m.sender.name}</span>
              <div className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                isMe ? "bg-primary/20 rounded-tr-sm" : "bg-white/8 rounded-tl-sm"
              }`}>
                {m.text && <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{m.text}</p>}
                {m.fileUrl && isImage(m.fileMime) && (
                  <a href={m.fileUrl} target="_blank" rel="noopener noreferrer">
                    {/* User-uploaded chat attachment from arbitrary storage URLs —
                        next/image would require per-host remotePatterns config. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.fileUrl} alt={m.fileName ?? "img"} className="rounded-lg max-w-full max-h-48 object-cover mt-1" />
                  </a>
                )}
                {m.fileUrl && isAudio(m.fileMime) && (
                  <audio controls src={m.fileUrl} className="mt-1 w-full max-w-[200px]" />
                )}
                {m.fileUrl && !isImage(m.fileMime) && !isAudio(m.fileMime) && (
                  <a href={m.fileUrl} target="_blank" rel="noopener noreferrer" download={m.fileName ?? true}
                    className="flex items-center gap-2 mt-1 text-xs text-primary hover:underline">
                    <span>📎</span>
                    <span className="truncate max-w-[120px]">{m.fileName ?? "Файл"}</span>
                    <span>↓</span>
                  </a>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground/70 mt-0.5">
                {new Date(m.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Emoji picker */}
      {showEmoji && (
        <div className="px-3 py-2 border-t border-white/10 flex flex-wrap gap-1.5 max-h-28 overflow-y-auto bg-video-bg">
          {EMOJIS.map(e => (
            <button key={e} onClick={() => { setText(prev => prev + e); setShowEmoji(false); }}
              className="text-xl hover:scale-110 transition-transform">
              {e}
            </button>
          ))}
        </div>
      )}

      {/* Ввод */}
      <div className="px-3 py-2 border-t border-white/10 bg-video-bg">
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Сообщение... (Enter — отправить)"
            rows={1}
            className="flex-1 resize-none rounded-xl bg-white/8 border border-white/10 px-3 py-2 text-sm focus:border-primary/50 focus:outline-none placeholder:text-muted-foreground/50 max-h-24 overflow-y-auto"
            style={{ minHeight: "38px" }}
          />
          <div className="flex flex-col gap-1">
            <button onClick={() => setShowEmoji(!showEmoji)}
              className="h-8 w-8 rounded-lg bg-white/8 text-sm hover:bg-white/15 transition-colors">
              😊
            </button>
            <button onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="h-8 w-8 rounded-lg bg-white/8 text-sm hover:bg-white/15 transition-colors disabled:opacity-50"
              title="Прикрепить файл">
              {uploading ? "⏳" : "📎"}
            </button>
            <button onClick={() => sendMessage(text)}
              disabled={sending || !text.trim()}
              className="h-8 w-8 rounded-lg bg-primary text-navy text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50">
              ↑
            </button>
          </div>
        </div>
        <input ref={fileRef} type="file"
          accept="image/*,application/pdf,audio/*,text/plain,.pdf,.txt,.jpg,.jpeg,.png,.gif,.webp,.mp3,.wav,.ogg,.m4a"
          className="hidden" onChange={handleFile} />
        <p className="text-[10px] text-muted-foreground/70 mt-1 text-right">
          Enter — отправить · Shift+Enter — новая строка
        </p>
      </div>
    </div>
  );
}
