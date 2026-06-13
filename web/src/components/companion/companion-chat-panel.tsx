"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Clock, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { COMPANION_MODES, type CompanionMode } from "@/lib/companion-chat";

type Msg = { role: "user" | "companion"; text: string; at: string };

type State = {
  id: string;
  mode: CompanionMode;
  messages: Msg[];
  freeRemaining: number;
  paidActive: boolean;
  minutesRemaining: number;
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

export function CompanionChatPanel({ dialogueId }: { dialogueId?: string | null }) {
  const [state, setState] = useState<State | null>(null);
  const [mode, setMode] = useState<CompanionMode>("explore");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [sending, setSending] = useState(false);
  const [paywall, setPaywall] = useState<{ credits: number; kopecks: number } | null>(null);
  const [crisis, setCrisis] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const qs = dialogueId ? `?dialogueId=${encodeURIComponent(dialogueId)}` : "";
    api<{ state: State }>(`/api/companion-chat${qs}`)
      .then(({ state: s }) => {
        setState(s);
        setMessages(s.messages);
        setMode(s.mode);
      })
      .catch(() => setNotice("Войдите, чтобы продолжить разговор в чате."));
  }, [dialogueId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

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
    if (!text || sending) return;
    setSending(true);
    setNotice(null);
    setMessages((prev) => [...prev, { role: "user", text, at: new Date().toISOString() }]);
    setInput("");
    try {
      const { result } = await api<{ result: SendResult }>("/api/companion-chat", {
        method: "POST",
        body: JSON.stringify({ sessionId: state?.id, dialogueId, message: text, mode, sourceDialogueId: dialogueId }),
      });
      setState(result.state);
      if (result.kind === "paywalled") {
        setPaywall(result.cost);
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

  async function startSession() {
    if (!state) return;
    setSending(true);
    try {
      const res = await api<{ ok: boolean; includedByPremium: boolean; state: State }>("/api/companion-chat/session", {
        method: "POST",
        body: JSON.stringify({ sessionId: state.id, action: "start" }),
      });
      setState(res.state);
      setPaywall(null);
      setNotice(res.includedByPremium ? "Сеанс открыт по подписке Premium." : "Сеанс открыт. Можно продолжать разговор.");
    } catch (error) {
      const e = error as Error & { status?: number };
      setNotice(e.status === 402 ? "Недостаточно баллов — пополните кошелёк." : (e.message || "Не удалось открыть сеанс"));
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
      setNotice("Сеанс продлён на 30 минут.");
    } catch (error) {
      const e = error as Error & { status?: number };
      setNotice(e.status === 402 ? "Недостаточно баллов для продления." : (e.message || "Не удалось продлить"));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="soft-card soft-form-panel flex h-[70vh] max-h-[680px] flex-col" data-testid="companion-chat-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--soft-paper-edge)] pb-4">
        <div>
          <p className="soft-eyebrow">разговор в чате</p>
          <h2 className="soft-h3 mt-1">Разобраться вместе, спокойно</h2>
        </div>
        {state && (
          <span className="soft-badge soft-badge-warm" data-testid="companion-status">
            {state.paidActive ? `сеанс · ещё ${state.minutesRemaining} мин` : `бесплатно · осталось ${state.freeRemaining}`}
          </span>
        )}
      </div>

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

      {paywall ? (
        <div className="mt-3 rounded-[18px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4" data-testid="companion-paywall">
          <p className="font-heading text-lg text-[var(--soft-bordeaux)]">Продолжить разговор в сеансе</p>
          <p className="mt-1 text-sm text-[var(--soft-ink-soft)]">
            Бесплатные сообщения закончились. Сеанс на 45 минут — {paywall.credits} балла (≈{Math.round(paywall.kopecks / 100)} ₽). Premium — 2 сеанса в месяц включены.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button type="button" onClick={startSession} disabled={sending} className="soft-button soft-button-primary" data-testid="companion-start-session">
              <Sparkles className="size-4" aria-hidden="true" />
              Открыть сеанс
            </Button>
            <Link href="/cabinet/wallet" className="soft-button soft-button-ghost">Пополнить кошелёк</Link>
          </div>
        </div>
      ) : (
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
      )}

      {state?.paidActive && (
        <button type="button" onClick={extendSession} disabled={sending} className="mt-2 self-end text-xs font-medium text-[var(--soft-bordeaux)] underline underline-offset-4" data-testid="companion-extend">
          <Clock className="mr-1 inline size-3.5" aria-hidden="true" />
          Продлить на 30 минут (2 балла)
        </button>
      )}
    </div>
  );
}
