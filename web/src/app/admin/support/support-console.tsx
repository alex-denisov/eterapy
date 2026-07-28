"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dispatchAdminCountsChanged } from "@/lib/admin-counts-events";
import {
  Archive,
  ArrowLeft,
  ArrowUpRight,
  CircleDot,
  Inbox,
  LoaderCircle,
  MessageCircleMore,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  UserRound,
} from "lucide-react";

type SupportUser = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
};

type ConversationSummary = {
  id: string;
  status: string;
  subject: string | null;
  createdAt: string;
  closedAt: string | null;
  lastActivityAt: string;
  lastMessageRole: string | null;
  preview: string;
  messageCount: number;
  user: SupportUser;
};

type SupportMessage = {
  id: string;
  role: string;
  content: string;
  createdAt: string;
};

type ConversationDetail = {
  id: string;
  status: string;
  subject: string | null;
  createdAt: string;
  closedAt: string | null;
  user: SupportUser;
  messages: SupportMessage[];
};

type QueueFilter = "OPEN" | "CLOSED" | "ALL";

const LIST_POLL_MS = 10_000;
const THREAD_POLL_MS = 3_000;
const MESSAGE_MAX = 2000;

function displayName(user: SupportUser): string {
  return user.name?.trim() || user.email?.trim() || `Клиент ${user.id.slice(0, 8)}`;
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function SupportConsole() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [filter, setFilter] = useState<QueueFilter>("OPEN");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [mutatingStatus, setMutatingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const lastMessageAtRef = useRef<string | null>(null);

  const loadList = useCallback(async (silent = false) => {
    if (!silent) setLoadingList(true);
    try {
      const response = await fetch("/api/admin/support/conversations", { cache: "no-store" });
      if (!response.ok) throw new Error("Не удалось загрузить очередь обращений");
      const payload = (await response.json()) as { conversations?: ConversationSummary[] };
      const next = payload.conversations ?? [];
      setConversations(next);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Ошибка загрузки");
    } finally {
      if (!silent) setLoadingList(false);
    }
  }, []);

  const loadThread = useCallback(async (id: string, silent = false) => {
    if (!silent) setLoadingThread(true);
    try {
      const url = new URL(`/api/admin/support/conversations/${id}`, window.location.origin);
      if (silent && lastMessageAtRef.current) url.searchParams.set("since", lastMessageAtRef.current);
      const response = await fetch(url.toString(), { cache: "no-store" });
      if (!response.ok) throw new Error("Не удалось загрузить обращение");
      const payload = (await response.json()) as { conversation: ConversationDetail };
      const latestIncoming = payload.conversation.messages.at(-1)?.createdAt;
      if (latestIncoming) lastMessageAtRef.current = latestIncoming;
      setDetail((current) => {
        if (current?.id === id && silent) {
          const known = new Set(current.messages.map((message) => message.id));
          const additions = payload.conversation.messages.filter((message) => !known.has(message.id));
          return { ...payload.conversation, messages: [...current.messages, ...additions] };
        }
        return payload.conversation;
      });
      setError(null);
    } catch (loadError) {
      if (!silent) setError(loadError instanceof Error ? loadError.message : "Ошибка загрузки");
    } finally {
      if (!silent) setLoadingThread(false);
    }
  }, []);

  useEffect(() => {
    void (async () => { await loadList(); })();
    const timer = window.setInterval(() => void loadList(true), LIST_POLL_MS);
    return () => window.clearInterval(timer);
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) return;
    void (async () => { await loadThread(selectedId); })();
    const timer = window.setInterval(() => void loadThread(selectedId, true), THREAD_POLL_MS);
    return () => window.clearInterval(timer);
  }, [loadThread, selectedId]);

  useEffect(() => {
    const node = threadRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [detail?.messages.length]);

  const counts = useMemo(() => ({
    open: conversations.filter((item) => item.status === "OPEN").length,
    waiting: conversations.filter((item) => item.status === "OPEN" && item.lastMessageRole === "USER").length,
    closed: conversations.filter((item) => item.status === "CLOSED").length,
  }), [conversations]);

  const visibleConversations = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ru-RU");
    return conversations.filter((item) => {
      if (filter !== "ALL" && item.status !== filter) return false;
      if (!normalized) return true;
      return [displayName(item.user), item.user.email, item.preview, item.subject, item.id]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase("ru-RU").includes(normalized));
    });
  }, [conversations, filter, query]);

  async function sendReply() {
    const content = draft.trim();
    if (!selectedId || !content || sending || detail?.status !== "OPEN") return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/support/conversations/${selectedId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const payload = (await response.json().catch(() => ({}))) as { message?: SupportMessage; error?: string };
      if (!response.ok || !payload.message) throw new Error(payload.error ?? "Не удалось отправить ответ");
      setDetail((current) => current?.id === selectedId
        ? { ...current, messages: [...current.messages, payload.message!] }
        : current);
      lastMessageAtRef.current = payload.message.createdAt;
      setDraft("");
      await loadList(true);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Ошибка отправки");
    } finally {
      setSending(false);
    }
  }

  async function changeStatus(status: "OPEN" | "CLOSED") {
    if (!selectedId || mutatingStatus) return;
    setMutatingStatus(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/support/conversations/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Не удалось изменить статус");
      setDetail((current) => current ? { ...current, status, closedAt: status === "CLOSED" ? new Date().toISOString() : null } : current);
      dispatchAdminCountsChanged();
      await loadList(true);
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Ошибка обновления");
    } finally {
      setMutatingStatus(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="admin-support-console">
      <header className="flex flex-col gap-4 rounded-2xl border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4 shadow-[0_18px_50px_-42px_rgba(60,30,20,0.65)] sm:p-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="soft-eyebrow">клиентский сервис</p>
          <h1 className="mt-1 font-heading text-2xl font-semibold text-[var(--soft-ink)] sm:text-3xl">Консоль обращений</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--soft-ink-soft)]">
            История и ответы хранятся здесь. Клиент получает ответ в чате своего кабинета.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { void loadList(); if (selectedId) void loadThread(selectedId); }}
          className="soft-button soft-button-ghost h-11 self-start px-3 text-sm sm:h-9 lg:self-auto"
          disabled={loadingList}
        >
          <RefreshCw className={`size-4 ${loadingList ? "animate-spin" : ""}`} aria-hidden="true" />
          Обновить
        </button>
      </header>

      <section className="grid grid-cols-3 gap-2 sm:gap-3" aria-label="Сводка обращений">
        <Metric label="Открыто" value={counts.open} icon={CircleDot} tone="bordeaux" />
        <Metric label="Ждут ответа" value={counts.waiting} icon={MessageCircleMore} tone="terracotta" />
        <Metric label="Закрыто" value={counts.closed} icon={Archive} tone="neutral" />
      </section>

      {error && (
        <div className="rounded-xl border border-[var(--soft-bordeaux)]/25 bg-[var(--soft-blush)] px-4 py-2.5 text-sm text-[var(--soft-bordeaux)]" role="alert">
          {error}
        </div>
      )}

      <div className="grid min-h-[650px] overflow-hidden rounded-2xl border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] shadow-[0_24px_70px_-52px_rgba(60,30,20,0.65)] lg:grid-cols-[minmax(300px,390px)_minmax(0,1fr)]">
        <aside className={`${selectedId ? "hidden lg:flex" : "flex"} min-h-[360px] flex-col border-b border-[var(--soft-paper-edge)] lg:border-b-0 lg:border-r`} aria-label="Очередь обращений">
          <div className="space-y-3 border-b border-[var(--soft-paper-edge)] p-3">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--soft-ink-faint)]" aria-hidden="true" />
              <span className="sr-only">Поиск обращений</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Клиент, email или текст…"
                className="h-10 w-full rounded-xl border border-[var(--soft-paper-edge)] bg-[var(--soft-paper)] pl-9 pr-3 text-sm text-[var(--soft-ink)] outline-none transition-colors focus:bg-white"
                data-testid="admin-support-search"
              />
            </label>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-[var(--soft-paper-deep)] p-1" role="group" aria-label="Фильтр статуса">
              {(["OPEN", "CLOSED", "ALL"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={`min-h-11 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors sm:min-h-8 ${filter === value ? "bg-[var(--soft-paper-card)] text-[var(--soft-bordeaux)] shadow-sm" : "text-[var(--soft-ink-soft)] hover:text-[var(--soft-ink)]"}`}
                  aria-pressed={filter === value}
                >
                  {value === "OPEN" ? "Открытые" : value === "CLOSED" ? "Закрытые" : "Все"}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto" data-testid="admin-support-queue">
            {loadingList && conversations.length === 0 ? (
              <QueueSkeleton />
            ) : visibleConversations.length === 0 ? (
              <EmptyState icon={Inbox} title="В этой очереди обращений нет" />
            ) : visibleConversations.map((conversation) => {
              const selected = conversation.id === selectedId;
              const waiting = conversation.status === "OPEN" && conversation.lastMessageRole === "USER";
              return (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(conversation.id);
                    setDetail((current) => current?.id === conversation.id ? current : null);
                    lastMessageAtRef.current = null;
                  }}
                  className={`relative block w-full border-b border-[var(--soft-paper-edge)] px-4 py-3.5 text-left transition-colors ${selected ? "bg-[var(--soft-apricot)]/35" : "hover:bg-[var(--soft-paper)]"}`}
                  data-testid="admin-support-conversation"
                  aria-pressed={selected}
                >
                  <span className="flex items-start gap-3">
                    <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-[var(--soft-paper-deep)] text-[var(--soft-bordeaux)]">
                      <UserRound className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-[var(--soft-ink)]">{displayName(conversation.user)}</span>
                        {waiting && <span className="size-2 shrink-0 rounded-full bg-[var(--soft-terracotta)]" title="Ждёт ответа" />}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-[var(--soft-ink-faint)]">{conversation.user.email ?? conversation.user.role}</span>
                      <span className="mt-2 line-clamp-2 block text-sm leading-snug text-[var(--soft-ink-soft)]">{conversation.preview}</span>
                      <span className="mt-2 flex items-center justify-between text-[11px] text-[var(--soft-ink-faint)]">
                        <span>{formatDateTime(conversation.lastActivityAt)}</span>
                        <span>{conversation.messageCount} сообщ.</span>
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className={`${selectedId ? "flex" : "hidden lg:flex"} min-h-[620px] min-w-0 flex-col`} aria-label="Диалог с клиентом">
          {!selectedId ? (
            <EmptyState icon={MessageCircleMore} title="Выберите обращение в очереди" fill />
          ) : loadingThread && (!detail || detail.id !== selectedId) ? (
            <ThreadSkeleton />
          ) : detail?.id === selectedId ? (
            <>
              <div className="flex flex-col gap-3 border-b border-[var(--soft-paper-edge)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => { setSelectedId(null); setDetail(null); lastMessageAtRef.current = null; }}
                      className="grid size-11 shrink-0 place-items-center rounded-full text-[var(--soft-ink-soft)] hover:bg-[var(--soft-paper-deep)] lg:hidden"
                      aria-label="Вернуться к очереди обращений"
                    >
                      <ArrowLeft className="size-4" aria-hidden="true" />
                    </button>
                    <h2 className="truncate text-base font-semibold text-[var(--soft-ink)]">{displayName(detail.user)}</h2>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${detail.status === "OPEN" ? "bg-emerald-100 text-emerald-800" : "bg-stone-100 text-stone-600"}`}>
                      {detail.status === "OPEN" ? "Открыто" : "Закрыто"}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-[var(--soft-ink-faint)]">{detail.user.email ?? detail.user.id} · с {formatDateTime(detail.createdAt)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <a href={`/admin/product/users?q=${encodeURIComponent(detail.user.email ?? detail.user.id)}`} className="soft-button soft-button-ghost h-11 px-2.5 text-xs sm:h-8">
                    Профиль <ArrowUpRight className="size-3.5" aria-hidden="true" />
                  </a>
                  {detail.status === "OPEN" ? (
                    <button type="button" onClick={() => void changeStatus("CLOSED")} disabled={mutatingStatus} className="soft-button soft-button-ghost h-11 px-2.5 text-xs sm:h-8">
                      <Archive className="size-3.5" aria-hidden="true" /> Закрыть
                    </button>
                  ) : (
                    <button type="button" onClick={() => void changeStatus("OPEN")} disabled={mutatingStatus} className="soft-button soft-button-ghost h-11 px-2.5 text-xs sm:h-8">
                      <RotateCcw className="size-3.5" aria-hidden="true" /> Переоткрыть
                    </button>
                  )}
                </div>
              </div>

              <div ref={threadRef} role="log" aria-live="polite" aria-relevant="additions" className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[linear-gradient(155deg,var(--soft-paper-deep),var(--soft-paper))] p-4 sm:p-5" data-testid="admin-support-thread">
                {detail.messages.map((message) => {
                  const fromSupport = message.role === "STAFF";
                  return (
                    <div key={message.id} className={`flex ${fromSupport ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[86%] rounded-2xl px-3.5 py-2.5 text-sm shadow-[0_2px_8px_-6px_rgba(60,30,20,0.5)] sm:max-w-[72%] ${fromSupport ? "rounded-br-md bg-[var(--soft-bordeaux)] text-[#FFF8F1]" : "rounded-bl-md border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] text-[var(--soft-ink)]"}`}>
                        <p className={`mb-1 text-[11px] font-semibold ${fromSupport ? "text-[#FFF8F1]/75" : "text-[var(--soft-terracotta-dark)]"}`}>
                          {fromSupport ? "Поддержка ETerapy" : displayName(detail.user)}
                        </p>
                        <p className="whitespace-pre-wrap leading-relaxed [overflow-wrap:anywhere]">{message.content}</p>
                        <p className={`mt-1 text-right text-[10px] tabular-nums ${fromSupport ? "text-[#FFF8F1]/60" : "text-[var(--soft-ink-faint)]"}`}>{formatTime(message.createdAt)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-3 sm:p-4">
                {detail.status === "OPEN" ? (
                  <div className="flex items-end gap-2">
                    <label className="min-w-0 flex-1">
                      <span className="sr-only">Ответ клиенту</span>
                      <textarea
                        value={draft}
                        onChange={(event) => setDraft(event.target.value.slice(0, MESSAGE_MAX))}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            void sendReply();
                          }
                        }}
                        placeholder="Ответ клиенту…"
                        rows={2}
                        maxLength={MESSAGE_MAX}
                        disabled={sending}
                        className="max-h-36 min-h-12 w-full resize-none rounded-2xl border border-[var(--soft-paper-edge)] bg-[var(--soft-paper)] px-4 py-3 text-sm text-[var(--soft-ink)] outline-none transition-colors focus:bg-white"
                        data-testid="admin-support-reply-input"
                      />
                    </label>
                    <button type="button" onClick={() => void sendReply()} disabled={sending || !draft.trim()} aria-label="Отправить ответ клиенту" className="grid size-12 shrink-0 place-items-center rounded-full bg-[var(--soft-terracotta)] text-[#FFF8F1] shadow-[0_8px_22px_-10px_rgba(214,117,88,0.8)] transition-transform active:scale-95 disabled:opacity-40" data-testid="admin-support-reply-send">
                      {sending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4 -translate-x-px" aria-hidden="true" />}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-[var(--soft-paper-deep)] px-4 py-3 text-sm text-[var(--soft-ink-soft)]">
                    <span>Обращение закрыто. Переоткройте его, чтобы ответить клиенту.</span>
                    <button type="button" onClick={() => void changeStatus("OPEN")} className="min-h-11 shrink-0 px-2 font-semibold text-[var(--soft-bordeaux)]">Переоткрыть</button>
                  </div>
                )}
                <p className="mt-1.5 text-[11px] text-[var(--soft-ink-faint)]">Ответ появится в чате кабинета · Enter — отправить · Shift+Enter — новая строка</p>
              </div>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof Inbox; tone: "bordeaux" | "terracotta" | "neutral" }) {
  const colors = tone === "bordeaux"
    ? "bg-[var(--soft-blush)] text-[var(--soft-bordeaux)]"
    : tone === "terracotta"
      ? "bg-[var(--soft-apricot)]/55 text-[var(--soft-terracotta-dark)]"
      : "bg-[var(--soft-paper-deep)] text-[var(--soft-ink-soft)]";
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-3 sm:gap-3 sm:p-4">
      <span className={`hidden size-9 shrink-0 place-items-center rounded-full sm:grid ${colors}`}><Icon className="size-4" aria-hidden="true" /></span>
      <span><span className="block text-xl font-semibold tabular-nums text-[var(--soft-ink)]">{value}</span><span className="block text-[11px] text-[var(--soft-ink-faint)] sm:text-xs">{label}</span></span>
    </div>
  );
}

function EmptyState({ icon: Icon, title, fill = false }: { icon: typeof Inbox; title: string; fill?: boolean }) {
  return (
    <div className={`grid place-items-center px-6 py-12 text-center text-sm text-[var(--soft-ink-faint)] ${fill ? "h-full" : ""}`}>
      <span><Icon className="mx-auto mb-2 size-5" aria-hidden="true" />{title}</span>
    </div>
  );
}

function QueueSkeleton() {
  return (
    <div className="space-y-1 p-3" aria-label="Загружаем обращения" role="status">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="flex animate-pulse gap-3 rounded-xl px-1 py-3" aria-hidden="true">
          <span className="size-9 shrink-0 rounded-full bg-[var(--soft-paper-deep)]" />
          <span className="min-w-0 flex-1 space-y-2">
            <span className="block h-3 w-2/5 rounded bg-[var(--soft-paper-deep)]" />
            <span className="block h-3 w-4/5 rounded bg-[var(--soft-paper-deep)]" />
            <span className="block h-3 w-3/5 rounded bg-[var(--soft-paper-deep)]" />
          </span>
        </div>
      ))}
    </div>
  );
}

function ThreadSkeleton() {
  return (
    <div className="flex h-full min-h-[620px] animate-pulse flex-col bg-[var(--soft-paper)] p-5" aria-label="Открываем диалог" role="status">
      <span className="h-5 w-40 rounded bg-[var(--soft-paper-deep)]" aria-hidden="true" />
      <div className="mt-12 space-y-5" aria-hidden="true">
        <span className="block h-16 w-3/5 rounded-2xl bg-[var(--soft-paper-deep)]" />
        <span className="ml-auto block h-20 w-1/2 rounded-2xl bg-[var(--soft-apricot)]/35" />
        <span className="block h-14 w-2/5 rounded-2xl bg-[var(--soft-paper-deep)]" />
      </div>
    </div>
  );
}
