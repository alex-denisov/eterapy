"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Mail, MessageCircle, Search } from "lucide-react";
import {
  searchFaq,
  categoryAllowsChat,
  pickThemeQuestions,
  SUPPORT_CATEGORIES,
} from "@/lib/support-faq";
import type { HelpFaqItem } from "@/lib/help-faq-data";
import { ComplaintForm } from "@/components/support/complaint-form";
import { SupportChat } from "@/components/support/support-chat";

// B464 IB6 + round-4 #18 — «Центр поддержки», Apple-style: a search gate with
// the loupe on the RIGHT (clickable), theme chips that surface 5 random
// questions from the help-centre base, and escalation gated by problem type
// (live chat ONLY for the six sensitive categories). ONE chips row drives both
// the suggestions and the escalation.
export function SupportHelpCenter({ telegramSupportUrl, showChat }: { telegramSupportUrl: string; showChat: boolean }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [themeQuestions, setThemeQuestions] = useState<HelpFaqItem[]>([]);
  const results = useMemo(() => searchFaq(query), [query]);
  const allowsChat = category ? categoryAllowsChat(category) : false;

  function pickCategory(id: string) {
    setCategory(id);
    setThemeQuestions(pickThemeQuestions(id, 5));
  }

  return (
    <div>
      {/* Search gate — the support centre hero */}
      <div className="soft-card p-6" data-testid="support-search">
        <p className="soft-eyebrow">поддержка eterapy</p>
        <h1 className="soft-h1 mt-2" data-testid="support-hero-title">Центр поддержки</h1>
        <p className="mt-2 max-w-2xl text-sm" style={{ color: "var(--soft-ink-soft)" }}>
          Опишите вопрос — покажем ответ. Или выберите тему ниже.
        </p>

        {/* Calm focus lives on the wrapper (:focus-within), the global
            terracotta :focus-visible outline is suppressed on the input. */}
        <form
          className="mt-4 flex items-center gap-1 rounded-[14px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] pl-4 pr-1.5 transition-[border-color,box-shadow] focus-within:border-[var(--soft-bordeaux)]/40 focus-within:shadow-[0_0_0_3px_rgba(92,42,44,0.08)]"
          onSubmit={(e) => { e.preventDefault(); setQuery((q) => q.trim()); }}
        >
          <input
            id="support-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="например: возврат, подписка, доступ к аккаунту"
            className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none focus-visible:outline-none"
            aria-label="Опишите вопрос"
            data-testid="support-search-input"
          />
          <button
            type="submit"
            aria-label="Найти ответ"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--soft-ink-faint)] transition-colors hover:bg-[var(--soft-paper-deep)] hover:text-[var(--soft-bordeaux)]"
            data-testid="support-search-submit"
          >
            <Search className="size-4" aria-hidden="true" />
          </button>
        </form>

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
              Ничего не нашли по запросу. Выберите тему ниже — подскажем ответы и самый быстрый способ связаться.
            </p>
          )
        )}

        {/* Theme chips — ONE row: picks the 5 random questions AND gates the
            escalation channels below. */}
        <div className="mt-5">
          <p className="text-xs font-medium" style={{ color: "var(--soft-ink-faint)" }}>подсказки по темам</p>
          <div className="mt-2 flex flex-wrap gap-2" role="tablist">
            {SUPPORT_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                onClick={() => pickCategory(c.id)}
                className={category === c.id ? "soft-chip soft-chip-warm" : "soft-chip"}
                data-testid={`support-cat-${c.id}`}
                aria-selected={category === c.id}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {category && themeQuestions.length > 0 && (
          <div className="mt-4 grid gap-2" data-testid="support-theme-questions">
            {themeQuestions.map((r) => (
              <details key={r.id} className="rounded-[12px] border border-[var(--soft-paper-edge)] p-3">
                <summary className="cursor-pointer list-none text-sm font-medium" style={{ color: "var(--soft-bordeaux)" }}>{r.q}</summary>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>{r.a}</p>
              </details>
            ))}
            <button
              type="button"
              onClick={() => setThemeQuestions(pickThemeQuestions(category, 5))}
              className="justify-self-start text-sm font-medium"
              style={{ color: "var(--soft-bordeaux)" }}
              data-testid="support-theme-refresh"
            >
              Показать другие вопросы →
            </button>
          </div>
        )}
      </div>

      {/* Escalation — channels adapt to the picked theme */}
      <div className="soft-card mt-4 p-6" data-testid="support-escalation">
        <h2 className="soft-h3">Всё ещё остались вопросы?</h2>
        <p className="mt-2 text-sm" style={{ color: "var(--soft-ink-soft)" }}>
          {category
            ? "Мы на связи — выберите удобный способ."
            : "Выберите тему выше — предложим подходящий способ связи."}
        </p>

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
