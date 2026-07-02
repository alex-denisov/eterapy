"use client";

import { useState } from "react";
import { ArrowRight, Mail, MessageCircle, Search } from "lucide-react";
import { searchFaq, categoryAllowsChat, SUPPORT_CATEGORIES } from "@/lib/support-faq";
import { ComplaintForm } from "@/components/support/complaint-form";
import { SupportChat } from "@/components/support/support-chat";

// B464 IB6 — Apple-style support gate: search FAQ first, then escalate by problem
// type. Email + web form are always offered; the live chat only for the six
// sensitive categories (finance/refunds/cancellations/privacy/specialist/account).
export function SupportHelpCenter({ telegramSupportUrl, showChat }: { telegramSupportUrl: string; showChat: boolean }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const results = searchFaq(query);
  const allowsChat = category ? categoryAllowsChat(category) : false;

  return (
    <div className="mt-8">
      {/* Search gate */}
      <div className="soft-card p-6" data-testid="support-search">
        <label htmlFor="support-search-input" className="soft-eyebrow">опишите вопрос — покажем ответ</label>
        <div className="mt-3 flex items-center gap-2 rounded-[14px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] px-3">
          <Search className="size-4 shrink-0" style={{ color: "var(--soft-ink-faint)" }} aria-hidden="true" />
          <input
            id="support-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="например: возврат, подписка, доступ к аккаунту"
            className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none"
            data-testid="support-search-input"
          />
        </div>

        {query.trim() && (
          results.length > 0 ? (
            <div className="mt-4 grid gap-2" data-testid="support-faq-results">
              {results.map((r) => (
                <details key={r.id} className="rounded-[12px] border border-[var(--soft-paper-edge)] p-3">
                  <summary className="cursor-pointer list-none text-sm font-medium" style={{ color: "var(--soft-bordeaux)" }}>{r.q}</summary>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>{r.a}</p>
                </details>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm" style={{ color: "var(--soft-ink-soft)" }} data-testid="support-faq-empty">
              Ничего не нашли по запросу. Выберите тему ниже — подскажем, как быстрее связаться.
            </p>
          )
        )}
      </div>

      {/* Escalation, gated by problem type */}
      <div className="soft-card mt-4 p-6" data-testid="support-escalation">
        <h2 className="soft-h3">Всё ещё остались вопросы?</h2>
        <p className="mt-2 text-sm" style={{ color: "var(--soft-ink-soft)" }}>Выберите тему — предложим подходящий способ связи.</p>

        <div className="mt-4 flex flex-wrap gap-2" role="tablist">
          {SUPPORT_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              onClick={() => setCategory(c.id)}
              className={category === c.id ? "soft-chip soft-chip-warm" : "soft-chip"}
              data-testid={`support-cat-${c.id}`}
              aria-selected={category === c.id}
            >
              {c.label}
            </button>
          ))}
        </div>

        {category && (
          <div className="mt-5 space-y-4" data-testid="support-escalation-actions">
            <div className="flex flex-wrap gap-2">
              <a href="mailto:support@eterapy.com" className="soft-button soft-button-ghost" data-testid="support-email">
                <Mail className="size-4" aria-hidden="true" /> Написать в поддержку
              </a>
              <span className="text-xs" style={{ color: "var(--soft-ink-faint)", alignSelf: "center" }}>
                ответ до 4 часов в будни
              </span>
            </div>

            {/* Web form — always available («Оставить запрос на сайте»). */}
            <ComplaintForm />

            {/* Live chat — only for the sensitive categories, and only for a
                signed-in user (the chat needs an account). */}
            {allowsChat ? (
              showChat ? (
                <div data-testid="support-live-chat">
                  <h3 className="soft-h3 mb-2 flex items-center gap-2">
                    <MessageCircle className="size-4 text-[var(--soft-terracotta-dark)]" aria-hidden="true" /> Написать в чат
                  </h3>
                  <p className="mb-3 text-sm" style={{ color: "var(--soft-ink-soft)" }}>
                    По этой теме можно написать нам напрямую — отвечаем командой поддержки.
                  </p>
                  <SupportChat />
                  <a href={telegramSupportUrl} target="_blank" rel="noopener noreferrer" className="soft-button soft-button-ghost mt-3" data-testid="support-telegram">
                    Открыть в Telegram <ArrowRight className="size-4" aria-hidden="true" />
                  </a>
                </div>
              ) : (
                <p className="text-sm" style={{ color: "var(--soft-ink-faint)" }}>Войдите в аккаунт, чтобы открыть чат с поддержкой по этой теме.</p>
              )
            ) : (
              <p className="text-sm" style={{ color: "var(--soft-ink-faint)" }} data-testid="support-no-chat">
                По этой теме отвечаем по почте или через форму выше — так быстрее и надёжнее.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
