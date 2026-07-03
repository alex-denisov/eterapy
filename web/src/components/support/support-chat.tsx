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

  // B464 round-4 #18 — Telegram-like: date separators, tailed bubbles with an
  // in-bubble timestamp, a pill composer with a round icon send button, and
  // Enter-to-send (Shift+Enter = newline).
  const groups = groupByDay(messages);

  return (
    <div className="overflow-hidden rounded-[18px] border border-[var(--soft-paper-edge)]" data-testid="support-chat">
      <div
        ref={scrollRef}
        className="flex max-h-[420px] min-h-[280px] flex-col gap-2 overflow-y-auto p-4"
        style={{ background: "linear-gradient(165deg, var(--soft-paper-deep) 0%, var(--soft-paper) 100%)" }}
        data-testid="support-chat-thread"
      >
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center text-[var(--soft-ink-faint)]">
            <MessageCircle className="size-5" aria-hidden="true" />
            <p className="max-w-xs text-sm">
              Напишите ваш вопрос — поддержка ответит в течение нескольких часов в будние дни.
            </p>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.day} className="contents">
              <div className="my-1 flex justify-center">
                <span className="rounded-full bg-[rgba(60,30,20,0.08)] px-3 py-0.5 text-[11px] font-medium text-[var(--soft-ink-soft)]" data-testid="support-chat-day">
                  {group.label}
                </span>
              </div>
              {group.items.map((message) => {
                const isUser = message.role === "USER";
                const isStaff = message.role === "STAFF";
                return (
                  <div
                    key={message.id}
                    className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] px-3.5 py-2 text-sm leading-snug shadow-[0_1px_2px_rgba(60,30,20,0.08)] ${
                        isUser
                          ? "rounded-[16px_16px_4px_16px] bg-[var(--soft-bordeaux)] text-[#FBF0E1]"
                          : isStaff
                            ? "rounded-[16px_16px_16px_4px] bg-[var(--soft-paper-card)] text-[var(--soft-ink)]"
                            : "rounded-[16px] bg-[var(--soft-paper-card)]/70 text-[var(--soft-ink-soft)]"
                      }`}
                      data-testid={`support-message-${message.role.toLowerCase()}`}
                    >
                      {!isUser && (
                        <p className="mb-0.5 text-[11px] font-semibold" style={{ color: "var(--soft-terracotta-dark)" }}>
                          {isStaff ? "Поддержка ETerapy" : "Система"}
                        </p>
                      )}
                      <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{message.content}</p>
                      <p className={`mt-0.5 text-right text-[10px] tabular-nums ${isUser ? "text-[#FBF0E1]/70" : "text-[var(--soft-ink-faint)]"}`}>
                        {new Date(message.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      <div className="border-t border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-3">
        {error && (
          <p className="mb-2 text-xs text-[var(--soft-bordeaux)]" data-testid="support-chat-error">
            {error}
          </p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value.slice(0, MESSAGE_MAX))}
            placeholder="Сообщение…"
            className="max-h-32 flex-1 resize-none rounded-[20px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper)] px-4 py-2.5 text-sm leading-relaxed text-[var(--soft-ink)] outline-none transition-colors focus-visible:outline-none focus:border-[var(--soft-bordeaux)]/40"
            rows={1}
            maxLength={MESSAGE_MAX}
            disabled={sending}
            data-testid="support-chat-input"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendMessage();
              }
            }}
          />
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={sending || draft.trim().length === 0}
            aria-label="Отправить сообщение"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--soft-terracotta)] text-[#FFF8F1] shadow-[0_6px_16px_-6px_rgba(214,117,88,0.7)] transition-[filter,transform] hover:brightness-105 active:scale-95 disabled:opacity-40"
            data-testid="support-chat-send"
          >
            <Send className="size-4 -translate-x-px" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-[var(--soft-ink-faint)]">
          Enter — отправить, Shift+Enter — новая строка · ответы появляются здесь автоматически.
        </p>
      </div>
    </div>
  );
}

// Group messages by calendar day for the Telegram-style date separators.
function groupByDay(messages: Message[]): Array<{ day: string; label: string; items: Message[] }> {
  const groups: Array<{ day: string; label: string; items: Message[] }> = [];
  for (const message of messages) {
    const date = new Date(message.createdAt);
    const day = Number.isNaN(date.getTime()) ? "unknown" : date.toDateString();
    const last = groups[groups.length - 1];
    if (last && last.day === day) {
      last.items.push(message);
    } else {
      groups.push({
        day,
        label: Number.isNaN(date.getTime())
          ? ""
          : date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" }),
        items: [message],
      });
    }
  }
  return groups;
}
