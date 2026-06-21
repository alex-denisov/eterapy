"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowRight, Clock, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { COMPANION_MODES, type CompanionMode } from "@/lib/companion-chat";
import { dispatchBalanceChanged } from "@/lib/balance-events";
import { loginUrl } from "@/lib/subdomain";

type Msg = { role: "user" | "companion"; text: string; at: string };

type State = {
  id: string;
  mode: CompanionMode;
  messages: Msg[];
  freeRemaining: number;
  paidActive: boolean;
  minutesRemaining: number;
  expiresAt: string | null;
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

function redirectToLogin(next?: string) {
  if (typeof window === "undefined") return;
  const target = next ?? window.location.pathname + window.location.search;
  window.location.href = `${loginUrl()}?next=${encodeURIComponent(target)}`;
}

// Оставшееся время оплаченного окна в формате MM:SS (по точному expiresAt).
function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
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
  const [mode, setMode] = useState<CompanionMode>("explore");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [sending, setSending] = useState(false);
  const [starting, setStarting] = useState(false);
  const [needsCredits, setNeedsCredits] = useState(false);
  const [crisis, setCrisis] = useState(false);
  const [ended, setEnded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [remainingMs, setRemainingMs] = useState<number>(0);
  const listRef = useRef<HTMLDivElement>(null);
  const endedNotifiedRef = useRef(false);
  const autoStartAttemptedRef = useRef(false);

  // Load the current session only for authed users (the GET requires auth).
  useEffect(() => {
    if (!authed) return;
    const params = new URLSearchParams();
    if (dialogueId) params.set("dialogueId", dialogueId);
    if (analysisId) params.set("analysisId", analysisId);
    const qs = params.toString() ? `?${params.toString()}` : "";
    api<{ state: State }>(`/api/companion-chat${qs}`)
      .then(({ state: s }) => {
        setState(s);
        setMessages(s.messages);
        setMode(s.mode);
      })
      .catch(() => setNotice("Не удалось загрузить диалог. Обновите страницу."));
  }, [authed, dialogueId, analysisId]);

  // Issue #7: keep the conversation pinned to the bottom by scrolling INSIDE the
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

  const paidActive = Boolean(state?.paidActive) && !ended;

  // Live countdown driven by the precise expiresAt; on reaching zero the session
  // ends, the input collapses and the parent is notified (B413 collapse + recs).
  // The badge only renders while paidActive, so no reset is needed when inactive.
  useEffect(() => {
    if (!state?.paidActive || !state.expiresAt) return;
    const expiry = new Date(state.expiresAt).getTime();
    const tick = () => {
      const left = expiry - Date.now();
      setRemainingMs(left);
      if (left <= 0) {
        setEnded(true);
        if (!endedNotifiedRef.current) {
          endedNotifiedRef.current = true;
          onSessionEnd?.();
        }
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state?.paidActive, state?.expiresAt, onSessionEnd]);

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
        body: JSON.stringify({ sessionId: state.id, action: "start" }),
      });
      setEnded(false);
      endedNotifiedRef.current = false;
      setState(res.state);
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
  }, [authed, state, loginNext]);

  // Task 7: auto-open the paid session once (after the session state loads) when
  // the panel was launched from the «Продолжить разговор в чате» CTA. This is what
  // makes the credits/₽ actually get charged on that click. startPaidSession is
  // idempotent (no double charge if already active); 402 surfaces needs-credits.
  useEffect(() => {
    if (!autoStart || !authed || !state) return;
    if (autoStartAttemptedRef.current) return;
    if (state.paidActive || ended || needsCredits) return;
    autoStartAttemptedRef.current = true;
    // Defer out of the effect body so startSession's setState isn't synchronous
    // within the effect (react-hooks/set-state-in-effect). The ref guards re-runs.
    void Promise.resolve().then(() => { void startSession(); });
  }, [autoStart, authed, state, ended, needsCredits, startSession]);

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
    if (!text || sending || !state) return;
    setSending(true);
    setNotice(null);
    setMessages((prev) => [...prev, { role: "user", text, at: new Date().toISOString() }]);
    setInput("");
    try {
      const { result } = await api<{ result: SendResult }>("/api/companion-chat", {
        method: "POST",
        body: JSON.stringify({ sessionId: state.id, dialogueId, sourceDialogueId: dialogueId, analysisId, sourceAnalysisId: analysisId, message: text, mode }),
      });
      setState(result.state);
      if (result.kind === "paywalled") {
        // The window lapsed mid-conversation — fall back to the start gate.
        setEnded(true);
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
      setState(res.state);
      setNotice("Сессия продлена на 30 минут.");
      dispatchBalanceChanged();
    } catch (error) {
      const e = error as Error & { status?: number };
      setNotice(e.status === 402 ? "Недостаточно баллов для продления." : (e.message || "Не удалось продлить"));
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

  return (
    <div className="flex flex-col" data-testid="companion-chat-panel">
      {!paidActive ? (
        // Paywall gate (unique to the paid chat) — kept in a soft-ask-card so it
        // sits in the same surface language as the /checkin ask card.
        <div className="soft-ask-card flex min-h-[52vh] flex-col p-6">{startGate}</div>
      ) : (
        <>
          {/* Issue #4: slim header — only the live timer. The product hero already
              titles the service, so we no longer repeat «Поговорим о том…» (the
              duplicate header that made /chat look unlike /checkin). */}
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="soft-eyebrow">живой диалог</p>
            <span className="soft-badge soft-badge-warm inline-flex items-center gap-1.5" data-testid="companion-timer">
              <Clock className="size-3.5" aria-hidden="true" />
              {formatRemaining(remainingMs)}
            </span>
          </div>

          <div className="mb-3 flex flex-wrap gap-2" data-testid="companion-modes">
            {(Object.keys(COMPANION_MODES) as CompanionMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`soft-chip text-xs ${mode === m ? "bg-[var(--soft-bordeaux)] text-[var(--soft-paper)]" : ""}`}
                title={COMPANION_MODES[m].hint}
              >
                {COMPANION_MODES[m].label}
              </button>
            ))}
          </div>

          {/* Issue #4: identical bubble thread to /checkin (soft-dialogue-chat).
              Issue #7: bounded height + internal scroll keeps the chat frame on
              the first screen instead of pushing the page up on every send. */}
          <div ref={listRef} className="soft-dialogue-chat max-h-[56vh] overflow-y-auto pr-1" data-testid="companion-messages">
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
                  {isUser ? (
                    <div className="soft-msg-avatar soft-msg-avatar-user" aria-hidden="true">В</div>
                  ) : (
                    <div className="soft-msg-avatar" aria-hidden="true" />
                  )}
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

          {notice && <p className="mt-2 rounded-[14px] bg-[var(--soft-paper-deep)] p-3 text-sm text-[var(--soft-bordeaux)]">{notice}</p>}

          {crisis && (
            <Link href="/practitioners" className="soft-button soft-button-ghost mt-2 self-start" data-testid="companion-crisis-cta">
              Найти специалиста
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          )}

          {/* Issue #4: composer in the same soft-ask-card surface as /checkin. */}
          <div className="soft-ask-card soft-dialogue-composer mt-3">
            <label htmlFor="companion-input" className="sr-only">Сообщение</label>
            <textarea
              id="companion-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={3}
              placeholder="Напишите сообщение…"
              className="soft-question-input soft-dialogue-composer-input"
              disabled={sending}
              data-testid="companion-input"
            />
            <div className="soft-ask-foot">
              <button
                type="button"
                onClick={extendSession}
                disabled={sending}
                className="soft-button soft-button-soft"
                data-testid="companion-extend"
              >
                <Clock className="size-4" aria-hidden="true" />
                Продлить на 30 минут (2 балла)
              </button>
              <Button type="button" onClick={send} disabled={sending || !input.trim()} className="soft-button soft-button-primary" data-testid="companion-send">
                Отправить
                <Send className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
