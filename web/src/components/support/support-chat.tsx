"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, MessageCircle, Plus, Send } from "lucide-react";
import type { SupportSessionSummary } from "@/lib/support-sessions";

// B333: in-cabinet support chat widget. Polls /api/support/messages every
// 3 seconds for staff replies that arrive through the Telegram webhook;
// POSTs user messages to the same endpoint, which forwards to the support
// TG group.
//
// B464 round-5 #13 — СЕССИИ: если у клиента ещё не было обращений, чат
// стартует сессию автоматически первым сообщением. Если сессии были — сначала
// список: любую можно посмотреть, продолжить можно ТОЛЬКО последнюю; явная
// кнопка начинает новую. Сессия без активности 30 минут закрывается по
// таймауту (сервер), но ответы поддержки продолжают приходить и в закрытую.

const POLL_INTERVAL_MS = 3000;
const MESSAGE_MAX = 2000;

type Message = {
  id: string;
  role: string;
  content: string;
  createdAt: string;
};

type ChatView =
  | { kind: "loading" }
  | { kind: "picker" }
  | { kind: "thread"; conversationId: string | null; writable: boolean; isNew: boolean };

function formatSessionDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) +
    ", " + date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function SupportChat() {
  const [view, setView] = useState<ChatView>({ kind: "loading" });
  const [sessions, setSessions] = useState<SupportSessionSummary[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSeenRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const activeConversationId = view.kind === "thread" ? view.conversationId : null;
  const writable = view.kind === "thread" && view.writable;

  // Навигация между списком и тредом сбрасывает ленту здесь (в обработчике),
  // а не в effect-теле — загрузка истории остаётся асинхронной в effect ниже.
  function openThread(next: { conversationId: string | null; writable: boolean; isNew: boolean }) {
    setMessages([]);
    lastSeenRef.current = null;
    setError(null);
    setView({ kind: "thread", ...next });
  }

  // Session list → decides between auto-start (no sessions) and the picker.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/support/conversations", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { sessions?: SupportSessionSummary[] };
        if (cancelled) return;
        const list = data.sessions ?? [];
        setSessions(list);
        if (list.length === 0) {
          // Auto-start: первый заход в чат — сразу композер, сессия создастся
          // первым сообщением.
          setView({ kind: "thread", conversationId: null, writable: true, isNew: true });
        } else {
          setView({ kind: "picker" });
        }
      } catch {
        if (!cancelled) setView({ kind: "thread", conversationId: null, writable: true, isNew: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadMessages = useCallback(async (conversationId: string, since: string | null) => {
    try {
      const url = new URL("/api/support/messages", window.location.origin);
      url.searchParams.set("conversationId", conversationId);
      if (since) url.searchParams.set("since", since);
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

  // Thread open — initial full load (no `since` cursor). The message list is
  // reset in openThread(); here we only fetch.
  useEffect(() => {
    if (view.kind !== "thread" || !view.conversationId) return;
    const conversationId = view.conversationId;
    let cancelled = false;
    (async () => {
      if (!cancelled) await loadMessages(conversationId, null);
    })();
    return () => {
      cancelled = true;
    };
  }, [view, loadMessages]);

  // Poll for new staff replies while a thread is open.
  useEffect(() => {
    if (!activeConversationId) return;
    const timer = window.setInterval(() => {
      void loadMessages(activeConversationId, lastSeenRef.current);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [activeConversationId, loadMessages]);

  // Auto-scroll to bottom when messages change.
  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages]);

  async function refreshSessions() {
    try {
      const res = await fetch("/api/support/conversations", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { sessions?: SupportSessionSummary[] };
      setSessions(data.sessions ?? []);
    } catch {
      // ignore
    }
  }

  async function sendMessage() {
    if (view.kind !== "thread" || !view.writable) return;
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
        body: JSON.stringify({
          content,
          ...(view.conversationId ? { conversationId: view.conversationId } : {}),
          ...(view.isNew && !view.conversationId ? { newSession: sessions.length > 0 } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Не удалось отправить сообщение");
      }
      const data = (await res.json()) as { conversationId?: string; message: Message };
      setMessages((prev) =>
        prev.map((m) => (m.id === optimistic.id ? data.message : m)),
      );
      lastSeenRef.current = data.message.createdAt;
      if (!view.conversationId && data.conversationId) {
        setView({ kind: "thread", conversationId: data.conversationId, writable: true, isNew: false });
        void refreshSessions();
      }
    } catch (sendError) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setDraft(content);
      setError(sendError instanceof Error ? sendError.message : "Ошибка отправки");
    } finally {
      setSending(false);
    }
  }

  if (view.kind === "loading") {
    return (
      <div className="rounded-[18px] border border-[var(--soft-paper-edge)] p-6 text-center text-sm text-[var(--soft-ink-faint)]" data-testid="support-chat-loading">
        Открываем чат…
      </div>
    );
  }

  // ── Session picker: были обращения → просмотр любой, продолжить — последнюю ──
  if (view.kind === "picker") {
    return (
      <div className="overflow-hidden rounded-[18px] border border-[var(--soft-paper-edge)]" data-testid="support-chat-picker">
        <div className="border-b border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] px-4 py-3">
          <p className="text-sm font-medium text-[var(--soft-ink)]">Ваши обращения</p>
          <p className="mt-0.5 text-xs text-[var(--soft-ink-faint)]">
            Продолжить можно последнее обращение; остальные доступны для просмотра.
          </p>
        </div>
        <div className="divide-y divide-[var(--soft-paper-edge)]">
          {sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => openThread({ conversationId: s.id, writable: s.canContinue, isNew: false })}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--soft-paper-card)]"
              data-testid="support-chat-session"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-[var(--soft-ink)]">{s.preview}</span>
                <span className="mt-0.5 block text-xs text-[var(--soft-ink-faint)]">
                  {formatSessionDate(s.lastActivityAt)} · {s.status === "OPEN" ? "открыта" : "завершена"}
                </span>
              </span>
              <span className="shrink-0 text-xs font-medium text-[var(--soft-bordeaux)]">
                {s.canContinue ? "Продолжить" : "Посмотреть"}
              </span>
              <ChevronRight className="size-4 shrink-0 text-[var(--soft-ink-faint)]" aria-hidden="true" />
            </button>
          ))}
        </div>
        <div className="border-t border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-3">
          <button
            type="button"
            onClick={() => openThread({ conversationId: null, writable: true, isNew: true })}
            className="soft-button soft-button-primary w-full justify-center"
            data-testid="support-chat-new-session"
          >
            <Plus className="size-4" aria-hidden="true" />
            Начать новое обращение
          </button>
        </div>
      </div>
    );
  }

  // ── Thread ──
  // B464 round-4 #18 — Telegram-like: date separators, tailed bubbles with an
  // in-bubble timestamp, a pill composer with a round icon send button, and
  // Enter-to-send (Shift+Enter = newline).
  const groups = groupByDay(messages);

  return (
    <div className="overflow-hidden rounded-[18px] border border-[var(--soft-paper-edge)]" data-testid="support-chat">
      {sessions.length > 0 && (
        <div className="flex items-center gap-2 border-b border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] px-3 py-2">
          <button
            type="button"
            onClick={() => { void refreshSessions(); setView({ kind: "picker" }); }}
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium text-[var(--soft-ink-soft)] transition-colors hover:bg-[var(--soft-paper-deep)] hover:text-[var(--soft-bordeaux)]"
            data-testid="support-chat-back"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            К обращениям
          </button>
          {!writable && (
            <span className="text-xs text-[var(--soft-ink-faint)]">просмотр — продолжить можно только последнее обращение</span>
          )}
        </div>
      )}
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

      {writable ? (
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
              className="max-h-32 flex-1 resize-none rounded-[20px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper)] px-4 py-2.5 text-sm leading-relaxed text-[var(--soft-ink)] outline-none transition-colors focus:border-[var(--soft-bordeaux)]/40 focus-visible:outline-none"
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
            Enter — отправить, Shift+Enter — новая строка · без сообщений 30 минут сессия закрывается.
          </p>
        </div>
      ) : (
        <div className="border-t border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-3">
          <button
            type="button"
            onClick={() => openThread({ conversationId: null, writable: true, isNew: true })}
            className="soft-button soft-button-ghost w-full justify-center"
            data-testid="support-chat-readonly-new"
          >
            <Plus className="size-4" aria-hidden="true" />
            Начать новое обращение
          </button>
        </div>
      )}
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
