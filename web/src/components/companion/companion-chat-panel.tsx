"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowRight, Clock, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { COMPANION_MODES, type CompanionMode } from "@/lib/companion-chat";
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
  // B413: slimmer styling so the panel can live inside the «разбор» result.
  inline?: boolean;
  // B413: notified when the paid window expires → parent collapses the chat and
  // re-shows the recommendations.
  onSessionEnd?: () => void;
  // Return path for the full /login redirect (defaults to the current URL).
  loginNext?: string;
};

export function CompanionChatPanel({ dialogueId, inline = false, onSessionEnd, loginNext }: CompanionChatPanelProps) {
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
  const endRef = useRef<HTMLDivElement>(null);
  const endedNotifiedRef = useRef(false);

  // Load the current session only for authed users (the GET requires auth).
  useEffect(() => {
    if (!authed) return;
    const qs = dialogueId ? `?dialogueId=${encodeURIComponent(dialogueId)}` : "";
    api<{ state: State }>(`/api/companion-chat${qs}`)
      .then(({ state: s }) => {
        setState(s);
        setMessages(s.messages);
        setMode(s.mode);
      })
      .catch(() => setNotice("Не удалось загрузить диалог. Обновите страницу."));
  }, [authed, dialogueId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

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
        body: JSON.stringify({ sessionId: state.id, dialogueId, message: text, mode, sourceDialogueId: dialogueId }),
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
    } catch (error) {
      const e = error as Error & { status?: number };
      setNotice(e.status === 402 ? "Недостаточно баллов для продления." : (e.message || "Не удалось продлить"));
    } finally {
      setSending(false);
    }
  }

  const containerClass = inline
    ? "soft-card flex h-[58vh] max-h-[560px] flex-col p-4"
    : "soft-card soft-form-panel flex h-[70vh] max-h-[680px] flex-col";

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
    <div className={containerClass} data-testid="companion-chat-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--soft-paper-edge)] pb-4">
        {/* Inline (B413) lives under the result's own «Разговор в чате» header,
            so the panel skips its title there and keeps only the timer. */}
        {inline ? (
          <p className="soft-eyebrow">живой диалог</p>
        ) : (
          <div>
            <p className="soft-eyebrow">разговор в чате</p>
            <h2 className="soft-h3 mt-1">Разобраться вместе, спокойно</h2>
          </div>
        )}
        {paidActive && (
          <span className="soft-badge soft-badge-warm inline-flex items-center gap-1.5" data-testid="companion-timer">
            <Clock className="size-3.5" aria-hidden="true" />
            ещё {formatRemaining(remainingMs)}
          </span>
        )}
      </div>

      {!paidActive ? (
        <div className="flex flex-1 flex-col">{startGate}</div>
      ) : (
        <>
          {!inline && (
            <div className="mt-3 flex flex-wrap gap-2" data-testid="companion-modes">
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
          )}

          <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1" data-testid="companion-messages">
            {messages.length === 0 && (
              <p className="font-heading text-lg italic leading-relaxed text-[var(--soft-ink-soft)]">
                Напишите, что сейчас занимает вас больше всего. Можно начать с малого.
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[82%] rounded-[16px] px-3.5 py-2.5 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "ml-auto bg-[var(--soft-bordeaux)] text-[var(--soft-paper)]"
                    : "mr-auto bg-[var(--soft-paper-deep)] text-[var(--soft-ink)]"
                }`}
                data-role={m.role}
              >
                {m.text}
              </div>
            ))}
            {typing && (
              <div className="mr-auto max-w-[60%] rounded-[16px] bg-[var(--soft-paper-deep)] px-4 py-3 text-sm text-[var(--soft-ink-soft)]" data-testid="companion-typing">
                печатает…
              </div>
            )}
            <div ref={endRef} />
          </div>

          {notice && <p className="mt-2 rounded-[14px] bg-[var(--soft-paper-deep)] p-3 text-sm text-[var(--soft-bordeaux)]">{notice}</p>}

          {crisis && (
            <Link href="/practitioners" className="soft-button soft-button-ghost mt-2 self-start" data-testid="companion-crisis-cta">
              Найти специалиста
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          )}

          <div className="mt-3 flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={2}
              placeholder="Напишите сообщение…"
              className="soft-question-input flex-1"
              disabled={sending}
              data-testid="companion-input"
            />
            <Button type="button" onClick={send} disabled={sending || !input.trim()} className="soft-button soft-button-primary" data-testid="companion-send">
              <Send className="size-4" aria-hidden="true" />
            </Button>
          </div>

          <button type="button" onClick={extendSession} disabled={sending} className="mt-2 self-end text-xs font-medium text-[var(--soft-bordeaux)] underline underline-offset-4" data-testid="companion-extend">
            <Clock className="mr-1 inline size-3.5" aria-hidden="true" />
            Продлить на 30 минут (2 балла)
          </button>
        </>
      )}
    </div>
  );
}
