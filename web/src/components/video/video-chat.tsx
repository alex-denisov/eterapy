"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";

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
  onClose?: () => void;
}

export function VideoChat({ videoSessionId, participantName, onClose }: VideoChatProps) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [writable, setWritable] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Загружаем историю
  useEffect(() => {
    if (!videoSessionId) return;
    fetch(`/api/video/chat?videoSessionId=${encodeURIComponent(videoSessionId)}&limit=50`)
      .then(async (response) => ({ response, data: await response.json().catch(() => null) }))
      .then(({ response, data }) => {
        if (response.status === 410) {
          setMessages([]);
          setWritable(false);
          return;
        }
        if (data?.messages) setMessages(data.messages);
        setNextCursor(data?.nextCursor ?? null);
        setWritable(data?.writable !== false);
      })
      .catch(() => toast.error("Не удалось загрузить чат"));
  }, [videoSessionId]);

  const loadOlder = useCallback(async () => {
    if (!videoSessionId || !nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const response = await fetch(
        `/api/video/chat?videoSessionId=${encodeURIComponent(videoSessionId)}&limit=50&cursor=${encodeURIComponent(nextCursor)}`,
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) throw new Error(data?.error ?? "Не удалось загрузить");
      setMessages((current) => [...data.messages, ...current]);
      setNextCursor(data.nextCursor ?? null);
      setWritable(data.writable !== false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось загрузить");
    } finally {
      setLoadingOlder(false);
    }
  }, [loadingOlder, nextCursor, videoSessionId]);

  // Скролл вниз при новых сообщениях
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async (msgText: string) => {
    if (!videoSessionId || !msgText.trim() || !writable) return;
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
        if (res.status === 409 || res.status === 410) setWritable(false);
        toast.error(d.error ?? "Ошибка");
      }
    } catch { toast.error("Ошибка сети"); }
    finally { setSending(false); }
  }, [videoSessionId, writable]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(text);
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !videoSessionId || !writable) return;
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
        if (res.status === 409 || res.status === 410) setWritable(false);
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
      <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <p className="text-sm font-semibold">Чат сессии</p>
          <p className="text-xs text-muted-foreground">
            Доступен во время сессии и 24 часа после её завершения
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full bg-white/8 hover:bg-white/15"
            aria-label="Закрыть чат"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Сообщения */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {nextCursor && (
          <button
            type="button"
            className="mx-auto block rounded-lg bg-white/8 px-3 py-1.5 text-xs hover:bg-white/15 disabled:opacity-50"
            disabled={loadingOlder}
            onClick={() => void loadOlder()}
          >
            {loadingOlder ? "Загружаем…" : "Показать более ранние"}
          </button>
        )}
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
      {writable && showEmoji && (
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
        {!writable && (
          <p className="mb-2 rounded-lg bg-white/8 px-3 py-2 text-xs text-muted-foreground" role="status">
            Сессия завершена: чат доступен только для чтения.
          </p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!writable}
            maxLength={2000}
            placeholder="Сообщение... (Enter — отправить)"
            rows={1}
            className="flex-1 resize-none rounded-xl bg-white/8 border border-white/10 px-3 py-2 text-sm focus:border-primary/50 focus:outline-none placeholder:text-muted-foreground/50 max-h-24 overflow-y-auto"
            style={{ minHeight: "38px" }}
          />
          <div className="flex flex-col gap-1">
            <button onClick={() => setShowEmoji(!showEmoji)}
              disabled={!writable}
              className="h-8 w-8 rounded-lg bg-white/8 text-sm hover:bg-white/15 transition-colors">
              😊
            </button>
            <button onClick={() => fileRef.current?.click()}
              disabled={uploading || !writable}
              className="h-8 w-8 rounded-lg bg-white/8 text-sm hover:bg-white/15 transition-colors disabled:opacity-50"
              title="Прикрепить файл">
              {uploading ? "⏳" : "📎"}
            </button>
            <button onClick={() => sendMessage(text)}
              disabled={sending || !text.trim() || !writable}
              className="h-8 w-8 rounded-lg bg-primary text-navy text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50">
              ↑
            </button>
          </div>
        </div>
        <input ref={fileRef} type="file"
          accept="image/*,application/pdf,audio/*,text/plain,.pdf,.txt,.jpg,.jpeg,.png,.gif,.webp,.mp3,.wav,.ogg,.m4a"
          className="hidden" disabled={!writable} onChange={handleFile} />
        <p className="text-[10px] text-muted-foreground/70 mt-1 text-right">
          Enter — отправить · Shift+Enter — новая строка
        </p>
      </div>
    </div>
  );
}
