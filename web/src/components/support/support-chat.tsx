"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, MessageCircle } from "lucide-react";

// B333: in-cabinet support chat widget. Polls /api/support/messages every
// 3 seconds for staff replies that arrive through the Telegram webhook;
// POSTs user messages to the same endpoint, which forwards to the support
// TG group.
//
// SSE is the natural future upgrade — for now polling is good enough
// given typical support response latency (minutes, not seconds) and keeps
// us on Vercel-edge-friendly request-response semantics.

const POLL_INTERVAL_MS = 3000;
const MESSAGE_MAX = 2000;

type Message = {
  id: string;
  role: string;
  content: string;
  createdAt: string;
};

export function SupportChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSeenRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const loadMessages = useCallback(async () => {
    try {
      const url = new URL("/api/support/messages", window.location.origin);
      if (lastSeenRef.current) url.searchParams.set("since", lastSeenRef.current);
      const res = await fetch(url.toString(), { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { messages: Message[] };
      if (data.messages.length > 0) {
        setMessages((prev) => {
          // Dedupe — messages can race with the optimistic POST insert.
          const seen = new Set(prev.map((m) => m.id));
          const next = [...prev];
          for (const message of data.messages) {
            if (!seen.has(message.id)) next.push(message);
          }
          return next;
        });
        lastSeenRef.current = data.messages.at(-1)?.createdAt ?? lastSeenRef.current;
      }
    } catch {
      // Ignore: the next tick will retry.
    }
  }, []);

  // Initial load — no `since` cursor so we pull the whole open thread.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/support/messages", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { messages: Message[] };
        if (cancelled) return;
        setMessages(data.messages);
        lastSeenRef.current = data.messages.at(-1)?.createdAt ?? null;
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Poll for new staff replies.
  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadMessages();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [loadMessages]);

  // Auto-scroll to bottom when messages change.
  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages]);

  async function sendMessage() {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setError(null);

    // Optimistic insert so the user sees their bubble immediately.
    const optimistic: Message = {
      id: `optimistic-${Date.now()}`,
      role: "USER",
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft("");

    try {
      const res = await fetch("/api/support/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Не удалось отправить сообщение");
      }
      const data = (await res.json()) as { message: Message };
      setMessages((prev) =>
        prev.map((m) => (m.id === optimistic.id ? data.message : m)),
      );
      lastSeenRef.current = data.message.createdAt;
    } catch (sendError) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setDraft(content);
      setError(sendError instanceof Error ? sendError.message : "Ошибка отправки");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="soft-card overflow-hidden" data-testid="support-chat">
      <div
        ref={scrollRef}
        className="flex max-h-[420px] min-h-[260px] flex-col gap-3 overflow-y-auto p-5"
        data-testid="support-chat-thread"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-[var(--soft-ink-faint)]">
            <MessageCircle className="size-5" aria-hidden="true" />
            <p className="text-sm">
              Напишите ваш вопрос — поддержка ответит в течение нескольких часов в будние дни.
            </p>
          </div>
        ) : (
          messages.map((message) => {
            const isUser = message.role === "USER";
            const isStaff = message.role === "STAFF";
            return (
              <div
                key={message.id}
                className={`flex ${isUser ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-snug ${
                    isUser
                      ? "bg-[var(--soft-bordeaux)] text-[#FBF0E1]"
                      : isStaff
                        ? "bg-[var(--soft-apricot)] text-[var(--soft-bordeaux)]"
                        : "bg-[var(--soft-paper-deep)] text-[var(--soft-ink-soft)]"
                  }`}
                  data-testid={`support-message-${message.role.toLowerCase()}`}
                >
                  {!isUser && (
                    <p className="mb-0.5 text-[10px] uppercase tracking-widest opacity-70">
                      {isStaff ? "поддержка" : "система"}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-[var(--soft-paper-edge)] p-4">
        {error && (
          <p className="mb-2 text-xs text-[var(--soft-bordeaux)]" data-testid="support-chat-error">
            {error}
          </p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value.slice(0, MESSAGE_MAX))}
            placeholder="Опишите коротко — что случилось, чем можно помочь."
            className="soft-question-input flex-1 resize-none"
            rows={2}
            maxLength={MESSAGE_MAX}
            disabled={sending}
            data-testid="support-chat-input"
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void sendMessage();
              }
            }}
          />
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={sending || draft.trim().length === 0}
            className="soft-button soft-button-primary h-10 px-4 text-sm"
            data-testid="support-chat-send"
          >
            <Send className="size-4" aria-hidden="true" />
            Отправить
          </button>
        </div>
        <p className="mt-2 text-[11px] text-[var(--soft-ink-faint)]">
          Ctrl/⌘+Enter — отправить · ответы поддержки появляются здесь автоматически.
        </p>
      </div>
    </div>
  );
}
