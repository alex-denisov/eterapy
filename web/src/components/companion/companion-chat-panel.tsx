"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowRight, Clock, Compass, MessageSquareText, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserMsgAvatar } from "@/components/dialogue/user-msg-avatar";
import { ServiceTriage, type TriagePrimary, type TriageProduct } from "@/components/products/service-triage";
import { useAutoGrowTextarea } from "@/lib/use-autogrow-textarea";
import { dispatchBalanceChanged } from "@/lib/balance-events";
import { dispatchCompanionSession } from "@/lib/companion-session-events";
import { recommendPrimaryProduct, recommendSecondaryProducts } from "@/lib/product-format-recommendations";
import { pointsWord } from "@/lib/points";
import { loginUrl } from "@/lib/subdomain";

type Msg = { role: "user" | "companion"; text: string; at: string };

type State = {
  id: string;
  messages: Msg[];
  freeRemaining: number;
  // A paid window has been opened on this session at some point (paidStartedAt set).
  started: boolean;
  paidActive: boolean;
  minutesRemaining: number;
  expiresAt: string | null;
  // B445: окончание оплаченного окна (даже в прошлом) — от него считаем 5-минутное
  // «окно решения» о продлении и блокируем чат по его истечении.
  windowExpiresAt: string | null;
  cost: { credits: number; kopecks: number };
};

type SendResult =
  | { kind: "crisis"; reply: string[]; typingMs: number[]; state: State }
  | { kind: "deflect"; reply: string[]; typingMs: number[]; state: State }
  | { kind: "paywalled"; cost: { credits: number; kopecks: number }; state: State }
  | { kind: "reply"; reply: string[]; typingMs: number[]; state: State };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((json as { error?: string }).error ?? "Ошибка") as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return json as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// B417: «время в разговоре» — платная синхронная услуга. Цена утверждена
// владельцем (см. lib/chat-session.ts). Бесплатного входа на этой поверхности
// НЕТ — бесплатен первичный разбор, а не чат (owner decision 2026-06-17).
const SESSION_PRICE_LINE = "45 минут · 4 балла или 790 ₽";

// Issue #7: same input cap as the /checkin clarifying composer (B319) — roomy for
// a thoughtful reply while keeping the LLM context bounded.
const CHAT_INPUT_MAX_CHARS = 1200;

// B445: «окно решения» о продлении после 00:00 (мс). Должно совпадать с
// CHAT_SESSION_GRACE_MINUTES на сервере (5 минут).
const GRACE_WINDOW_MS = 5 * 60_000;

function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${mm.toString().padStart(2, "0")}:${ss.toString().padStart(2, "0")}`;
}

function redirectToLogin(next?: string) {
  if (typeof window === "undefined") return;
  const target = next ?? window.location.pathname + window.location.search;
  window.location.href = `${loginUrl()}?next=${encodeURIComponent(target)}`;
}

export type CompanionChatPanelProps = {
  dialogueId?: string | null;
  // Issue #7: continue a chat-analysis разбор in its own seeded session, keyed to
  // the analysis (so it never lands on the user's unrelated standalone chat).
  analysisId?: string | null;
  // Notified when the paid window expires (e.g. to refresh surrounding UI).
  onSessionEnd?: () => void;
  // Return path for the full /login redirect (defaults to the current URL).
  loginNext?: string;
  // Task 7: when the user already chose «Продолжить разговор в чате» (a paid CTA
  // that shows the price), open the paid session immediately on mount — one click
  // charges and starts the conversation, instead of a second in-panel start gate.
  autoStart?: boolean;
};

export function CompanionChatPanel({ dialogueId, analysisId, onSessionEnd, loginNext, autoStart = false }: CompanionChatPanelProps) {
  const { status: authStatus } = useSession();
  const authed = authStatus === "authenticated";
  const [state, setState] = useState<State | null>(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [sending, setSending] = useState(false);
  const [starting, setStarting] = useState(false);
  const [needsCredits, setNeedsCredits] = useState(false);
  const [crisis, setCrisis] = useState(false);
  // Issue #5/#6: a paid session has been opened in this view. Stays true after the
  // window lapses so the chat stays on screen with a «Продлить» action and the hero
  // timer parks at 00:00 — we never fall back to the start gate mid-conversation.
  const [sessionOpen, setSessionOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [remainingMs, setRemainingMs] = useState<number>(0);
  // B445: остаток «окна решения» о продлении после 00:00 и флаг блокировки чата.
  const [graceMs, setGraceMs] = useState<number>(GRACE_WINDOW_MS);
  const [locked, setLocked] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const endedNotifiedRef = useRef(false);
  const autoStartAttemptedRef = useRef(false);
  // Telegram-like composer: 1 line → grows to 4 → scrolls.
  const { ref: inputRef } = useAutoGrowTextarea(input);

  // Issue #5: broadcast the session snapshot so the hero price pill swaps to the
  // live timer (and parks at 00:00 until an extend supplies a fresh expiresAt).
  const applySession = useCallback((s: State) => {
    setState(s);
    if (s.started || s.paidActive) {
      setSessionOpen(true);
      if (s.paidActive && s.expiresAt) {
        setRemainingMs(new Date(s.expiresAt).getTime() - Date.now());
        dispatchCompanionSession({ started: true, expiresAt: s.expiresAt });
      } else {
        setRemainingMs(-1);
        dispatchCompanionSession({ started: true, expiresAt: null });
      }
    }
  }, []);

  // Load the current session only for authed users (the GET requires auth).
  // Issue #1: a sessionId in the URL pins this exact session so a refresh restores
  // it (parity with the checkin ?dialogueId= restore), instead of «нет идентификатора».
  useEffect(() => {
    if (!authed) return;
    const params = new URLSearchParams();
    if (typeof window !== "undefined") {
      const urlSessionId = new URLSearchParams(window.location.search).get("sessionId");
      if (urlSessionId) params.set("sessionId", urlSessionId);
    }
    if (dialogueId) params.set("dialogueId", dialogueId);
    if (analysisId) params.set("analysisId", analysisId);
    const qs = params.toString() ? `?${params.toString()}` : "";
    api<{ state: State }>(`/api/companion-chat${qs}`)
      .then(({ state: s }) => {
        applySession(s);
        setMessages(s.messages);
      })
      .catch(() => setNotice("Не удалось загрузить диалог. Обновите страницу."));
  }, [authed, dialogueId, analysisId, applySession]);

  // Issue #1: once the session is known, reflect its id in the URL so a refresh
  // restores the same conversation (a standalone /products/chat start now also
  // carries an identifier, not only the checkin-continued one).
  useEffect(() => {
    if (typeof window === "undefined" || !state?.id) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("sessionId") !== state.id) {
      url.searchParams.set("sessionId", state.id);
      window.history.replaceState(null, "", url.toString());
    }
  }, [state?.id]);

  // Issue #3/#7: keep the conversation pinned to the bottom by scrolling INSIDE the
  // messages list only — never element.scrollIntoView, which also scrolls the
  // page/window and yanked the whole chat frame upward on every send.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typing]);

  // Issue #5: «продолжить разговор в чате» lands here with ?start=1 to open the
  // paid session in one click (autoStart). Drop that one-shot flag from the URL
  // on mount so a later refresh restores the chat WITHOUT re-charging a session.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.has("start")) {
      url.searchParams.delete("start");
      window.history.replaceState(null, "", url.toString());
    }
  }, []);

  // Live countdown driven by the precise expiresAt. On reaching zero the parent is
  // notified once (B413 recs) but the chat STAYS open — the composer swaps Send for
  // «Продлить» and the hero timer parks at 00:00 until the client pays to extend.
  useEffect(() => {
    if (!state?.paidActive || !state.expiresAt) return;
    const expiry = new Date(state.expiresAt).getTime();
    const tick = () => {
      const left = expiry - Date.now();
      setRemainingMs(left);
      if (left <= 0 && !endedNotifiedRef.current) {
        endedNotifiedRef.current = true;
        onSessionEnd?.();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state?.paidActive, state?.expiresAt, onSessionEnd]);

  // Live-active = a paid window that has NOT yet hit 00:00. expired = a session was
  // opened but its window has lapsed (drives the «Продлить»-instead-of-«Отправить» swap).
  const active = Boolean(state?.paidActive) && remainingMs > 0;
  const expired = sessionOpen && !active;

  // B445: пока окно активно — grace сброшен. Как только окно дошло до 00:00,
  // отсчитываем 5 минут «окна решения» от конца оплаченного окна (это переживает
  // перезагрузку: дедлайн берётся из windowExpiresAt сервера). По истечении —
  // locked: композер и кнопка «Продлить» блокируются, в сессию уже не зайти.
  const windowExpiresAt = state?.windowExpiresAt ?? null;
  useEffect(() => {
    const compute = () => {
      if (!expired) {
        setGraceMs(GRACE_WINDOW_MS);
        setLocked(false);
        return;
      }
      const base = windowExpiresAt ? new Date(windowExpiresAt).getTime() : Date.now();
      const left = base + GRACE_WINDOW_MS - Date.now();
      setGraceMs(Math.max(0, left));
      setLocked(left <= 0);
    };
    compute();
    const id = setInterval(compute, 1000);
    return () => clearInterval(id);
  }, [expired, windowExpiresAt]);

  const startSession = useCallback(async () => {
    if (!authed) {
      redirectToLogin(loginNext);
      return;
    }
    if (!state) return;
    setStarting(true);
    setNeedsCredits(false);
    setNotice(null);
    try {
      const res = await api<{ ok: boolean; includedByPremium: boolean; state: State }>("/api/companion-chat/session", {
        method: "POST",
        // B445: на свежем экране сессии ещё нет (state.id === "") — сервер создаёт
        // строку именно сейчас, под нужный источник, и только тогда списывает.
        body: JSON.stringify({
          sessionId: state.id || undefined,
          action: "start",
          sourceDialogueId: dialogueId,
          sourceAnalysisId: analysisId,
        }),
      });
      endedNotifiedRef.current = false;
      applySession(res.state);
      setNotice(res.includedByPremium ? "Сессия открыта по подписке Premium." : null);
      // Issue #5: a paid start just spent баллы — tell the header pill to re-fetch
      // immediately instead of waiting for a page reload to show the new balance.
      if (!res.includedByPremium) dispatchBalanceChanged();
    } catch (error) {
      const e = error as Error & { status?: number };
      if (e.status === 402) {
        setNeedsCredits(true);
      } else {
        setNotice(e.message || "Не удалось открыть сессию");
      }
    } finally {
      setStarting(false);
    }
  }, [authed, state, loginNext, applySession, dialogueId, analysisId]);

  // Task 7: auto-open the paid session once (after the session state loads) when
  // the panel was launched from the «Продолжить разговор в чате» CTA. This is what
  // makes the credits/₽ actually get charged on that click. startPaidSession is
  // idempotent (no double charge if already active); 402 surfaces needs-credits.
  useEffect(() => {
    if (!autoStart || !authed || !state) return;
    if (autoStartAttemptedRef.current) return;
    if (sessionOpen || needsCredits) return;
    autoStartAttemptedRef.current = true;
    // Defer out of the effect body so startSession's setState isn't synchronous
    // within the effect (react-hooks/set-state-in-effect). The ref guards re-runs.
    void Promise.resolve().then(() => { void startSession(); });
  }, [autoStart, authed, state, sessionOpen, needsCredits, startSession]);

  const revealReply = useCallback(async (chunks: string[], delays: number[]) => {
    for (let i = 0; i < chunks.length; i += 1) {
      setTyping(true);
      await sleep(Math.min(delays[i] ?? 1500, 9000));
      setTyping(false);
      setMessages((prev) => [...prev, { role: "companion", text: chunks[i], at: new Date().toISOString() }]);
      if (i < chunks.length - 1) await sleep(350);
    }
  }, []);

  async function send() {
    const text = input.trim();
    if (!text || sending || !state || expired) return;
    setSending(true);
    setNotice(null);
    setMessages((prev) => [...prev, { role: "user", text, at: new Date().toISOString() }]);
    setInput("");
    try {
      const { result } = await api<{ result: SendResult }>("/api/companion-chat", {
        method: "POST",
        body: JSON.stringify({ sessionId: state.id, dialogueId, sourceDialogueId: dialogueId, analysisId, sourceAnalysisId: analysisId, message: text }),
      });
      applySession(result.state);
      if (result.kind === "paywalled") {
        // The window lapsed mid-conversation — the composer now offers «Продлить».
        setNotice("Время сессии истекло. Продлите, чтобы продолжить разговор.");
      } else {
        setCrisis(result.kind === "crisis");
        await revealReply(result.reply, result.typingMs);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Не удалось отправить");
    } finally {
      setSending(false);
    }
  }

  async function extendSession() {
    if (!state) return;
    setSending(true);
    try {
      const res = await api<{ ok: boolean; state: State }>("/api/companion-chat/session", {
        method: "POST",
        body: JSON.stringify({ sessionId: state.id, action: "extend" }),
      });
      endedNotifiedRef.current = false;
      applySession(res.state);
      setNotice("Сессия продлена на 30 минут.");
      dispatchBalanceChanged();
    } catch (error) {
      const e = error as Error & { status?: number };
      if (e.status === 402) {
        setNotice("Недостаточно баллов для продления.");
      } else if (e.status === 409) {
        setNotice(e.message || "Сначала откройте сеанс, затем его можно продолжить.");
      } else {
        setNotice(e.message || "Не удалось продлить");
      }
    } finally {
      setSending(false);
    }
  }

  // ── Start gate (paid-only): shown until a paid window is active. ────────────
  const startGate = (
    <div className="m-auto w-full max-w-md text-center" data-testid="companion-start-gate">
      <span className="mx-auto flex size-12 items-center justify-center rounded-full" style={{ background: "var(--soft-apricot)" }}>
        <Sparkles className="size-6 text-[var(--soft-bordeaux)]" aria-hidden="true" />
      </span>
      <h3 className="soft-h3 mt-4">Живой диалог — 45 минут</h3>
      <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
        Спокойный разговор в своём темпе, чтобы разобрать вопрос глубже. {SESSION_PRICE_LINE}. В Premium входит 2 сессии в месяц.
      </p>
      {needsCredits ? (
        <div className="mt-5" data-testid="companion-needs-credits">
          <p className="text-sm font-medium text-[var(--soft-bordeaux)]">Недостаточно баллов для сессии.</p>
          <div className="mt-3 flex flex-wrap justify-center gap-3">
            <Link href="/cabinet/wallet" className="soft-button soft-button-primary">Пополнить кошелёк</Link>
            <Link href="/pricing" className="soft-button soft-button-ghost">Тарифы и Premium</Link>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          onClick={startSession}
          disabled={starting || (authed && !state)}
          className="soft-button soft-button-primary mt-5"
          data-testid="companion-start-session"
        >
          {authed ? (starting ? "Открываем…" : "Начать диалог") : "Войти и начать"}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
      )}
      {notice && <p className="mt-3 text-sm text-[var(--soft-bordeaux)]">{notice}</p>}
    </div>
  );

  if (!sessionOpen) {
    return (
      <div data-testid="companion-chat-panel" className="flex flex-col">
        {/* Paywall gate (unique to the paid chat) — kept in a soft-ask-card so it
            sits in the same surface language as the /checkin ask card. */}
        <div className="soft-ask-card flex min-h-[52vh] flex-col p-6">{startGate}</div>
      </div>
    );
  }

  // B487: когда сессия завершена (locked), история остаётся в том же чат-дизайне,
  // но сворачивается, а основное действие продолжает именно этот sessionId.
  const followupRec = recommendPrimaryProduct("other");
  const followupPrimary: TriagePrimary[] = [
    {
      key: "continue-dialog",
      testId: "companion-continue-dialog",
      ribbon: "вернуться в чат",
      icon: MessageSquareText,
      title: "Продолжить диалог",
      description: "Открыть ещё 30 минут в этой же переписке — история останется на месте.",
      priceSub: "30 мин · 2 балла",
      ctaLabel: "Продолжить",
      onClick: extendSession,
    },
    {
      key: followupRec.slug,
      testId: "companion-next-step",
      ribbon: "подобрано для вас",
      icon: Compass,
      title: followupRec.name,
      description: followupRec.reason,
      priceMain: followupRec.price,
      priceSub: followupRec.creditCost != null ? `или ${followupRec.creditCost} ${pointsWord(followupRec.creditCost)}` : null,
      ctaLabel: "Открыть",
      href: followupRec.href,
    },
  ];
  const followupSecondary: TriageProduct[] = recommendSecondaryProducts("other", followupRec.slug, 4)
    .filter((item) => item.slug !== "chat-analysis" && item.slug !== "chat-session")
    .slice(0, 3)
    .map((item) => ({ slug: item.slug, name: item.name, href: item.href, price: item.price, creditCost: item.creditCost }));

  const messageThread = (autoScroll: boolean) => (
    <div ref={autoScroll ? listRef : undefined} className="soft-dialogue-chat soft-chat-thread" data-testid="companion-messages">
      {messages.length === 0 && (
        <p className="font-heading text-lg italic leading-relaxed text-[var(--soft-ink-soft)]">
          Напишите, что сейчас занимает вас больше всего. Можно начать с малого.
        </p>
      )}
      {messages.map((m, i) => {
        const isUser = m.role === "user";
        return (
          <div
            key={i}
            className={`soft-msg-row ${isUser ? "soft-msg-row-user" : "soft-msg-row-assistant"}`}
            data-role={m.role}
          >
            {isUser ? <UserMsgAvatar /> : <div className="soft-msg-avatar" aria-hidden="true" />}
            <div
              className={`soft-msg-bubble ${isUser ? "soft-msg-bubble-user" : "soft-msg-bubble-assistant"}`}
              style={{ whiteSpace: "pre-wrap" }}
            >
              {m.text}
            </div>
          </div>
        );
      })}
      {typing && (
        <div className="soft-msg-row soft-msg-row-assistant" data-testid="companion-typing">
          <div className="soft-msg-avatar" aria-hidden="true" />
          <div className="soft-msg-bubble soft-msg-bubble-assistant">
            <div className="soft-typing"><span /><span /><span /></div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    // Issue #2/#3: Telegram-like surface — bounded height, the thread scrolls and
    // the composer is pinned to the bottom of the first screen. Issues #4/#5/#8: no
    // live-dialogue eyebrow, no in-panel timer (it lives in the hero now) and no
    // companion-mode chips — it is one chat that reads the mood on its own.
    <div data-testid="companion-chat-panel" className="soft-chat-screen" data-state={locked ? "completed" : "active"}>
      {locked ? (
        <details className="soft-chat-history-collapsed" data-testid="companion-history-collapsed">
          <summary>
            <span>История переписки</span>
            <span>{messages.length} сообщений</span>
          </summary>
          {messageThread(false)}
        </details>
      ) : messageThread(true)}

      {notice && <p className="mt-2 rounded-[14px] bg-[var(--soft-paper-deep)] p-3 text-sm text-[var(--soft-bordeaux)]">{notice}</p>}

      {crisis && (
        <Link href="/practitioners" className="soft-button soft-button-ghost mt-2 self-start" data-testid="companion-crisis-cta">
          Найти специалиста
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      )}

      {/* Composer in the same soft-ask-card surface as /checkin. In the completed
          result state it is removed entirely: the user continues through the CTA
          below, which reopens the same session and restores sending. */}
      {!locked && (
      <div
        className="soft-ask-card soft-dialogue-composer"
        data-testid="companion-composer"
        data-locked={locked}
        aria-disabled={locked}
      >
        <label htmlFor="companion-input" className="sr-only">Сообщение</label>
        <textarea
          id="companion-input"
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value.slice(0, CHAT_INPUT_MAX_CHARS))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          maxLength={CHAT_INPUT_MAX_CHARS}
          placeholder={expired ? (locked ? "Сессия завершена." : "Время сессии истекло — продлите, чтобы продолжить…") : "Напишите сообщение…"}
          className="soft-question-input soft-dialogue-composer-input"
          disabled={sending || expired || locked}
          data-testid="companion-input"
        />
          <div className="soft-ask-foot">
            {/* Issue #6 / B445: «Продлить» появляется только на 00:00 и стоит вместе с
                дисклеймером об автозавершении сессии при бездействии (таймер 5 минут). */}
            {expired ? (
              <div className="flex w-full flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-[var(--soft-ink-faint)]" data-testid="companion-grace" aria-live="polite">
                  При бездействии сессия завершится через{" "}
                  <span className="tabular-nums font-semibold text-[var(--soft-bordeaux)]">{formatClock(graceMs)}</span>
                </span>
                <Button
                  type="button"
                  onClick={extendSession}
                  disabled={sending}
                  className="soft-button soft-button-primary"
                  data-testid="companion-extend"
                >
                  <Clock className="size-3.5" aria-hidden="true" />
                  Продлить на 30 минут (2 балла)
                </Button>
              </div>
            ) : (
              <>
                {/* Issue #7: char counter — amber from -200, bordeaux from -50 (как в checkin). */}
                <span
                  className={`text-xs tabular-nums ${
                    input.length >= CHAT_INPUT_MAX_CHARS - 50
                      ? "text-[var(--soft-bordeaux)] font-semibold"
                      : input.length >= CHAT_INPUT_MAX_CHARS - 200
                        ? "text-[var(--soft-terracotta-dark)]"
                        : "text-[var(--soft-ink-faint)]"
                  }`}
                  data-testid="companion-char-counter"
                  aria-live="polite"
                >
                  {input.length}/{CHAT_INPUT_MAX_CHARS}
                </span>
                <Button type="button" onClick={send} disabled={sending || !input.trim()} className="soft-button soft-button-primary" data-testid="companion-send">
                  Отправить
                  <Send className="size-4" aria-hidden="true" />
                </Button>
              </>
            )}
          </div>
      </div>
      )}

      {locked && (
        <ServiceTriage
          eyebrow="что дальше"
          testId="companion-followup-triage"
          primary={followupPrimary}
          secondary={followupSecondary}
          specialistHref="/practitioners"
        />
      )}
    </div>
  );
}
