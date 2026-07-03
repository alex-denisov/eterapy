"use client";

import { useMemo, useState } from "react";
import { ArrowRight, ChevronDown, FileText, Mail, MessageCircle } from "lucide-react";
import { Search } from "lucide-react";
import {
  searchFaq,
  categoryAllowsChat,
  listThemeQuestions,
  SUPPORT_CATEGORIES,
} from "@/lib/support-faq";
import { SupportChat } from "@/components/support/support-chat";
import { SupportRequestForm } from "@/components/support/support-request-form";

// B464 IB6 + round-4 #18 + round-5 #13 — «Центр поддержки», staged flow:
//   1) изначально ТОЛЬКО «Поиск по базе знаний»;
//   2) после поиска — найденные статьи (аккордеон, раскрыт максимум один) и,
//      если ответа нет, «Не нашли нужный вопрос?» + карточки категорий;
//   3) категория → её вопросы (первые 5, «Показать ещё вопросы» ДОБАВЛЯЕТ);
//   4) под списком — «Не нашли ответ на свой вопрос?» + карточки эскалации:
//      почта (mailto) · веб-форма (inline) · чат (ТОЛЬКО финансовые/срочные
//      темы — six sensitive categories).

const THEME_PAGE = 5;

type FaqLike = { id: string; q: string; a: string };

// Round-5 #13: раскрыт максимум ОДИН вопрос одновременно.
function FaqAccordion({ items, testId }: { items: FaqLike[]; testId: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="grid gap-2" data-testid={testId}>
      {items.map((item) => {
        const open = openId === item.id;
        return (
          <div key={item.id} className="rounded-[12px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)]/60">
            <button
              type="button"
              onClick={() => setOpenId(open ? null : item.id)}
              aria-expanded={open}
              className="flex w-full items-center justify-between gap-3 p-3 text-left text-sm font-medium"
              style={{ color: "var(--soft-bordeaux)" }}
            >
              {item.q}
              <ChevronDown
                className={`size-4 shrink-0 text-[var(--soft-ink-faint)] transition-transform ${open ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>
            {open && (
              <p className="whitespace-pre-line px-3 pb-3 text-sm leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>
                {item.a}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function SupportHelpCenter({ telegramSupportUrl, showChat }: { telegramSupportUrl: string; showChat: boolean }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(THEME_PAGE);
  const [channel, setChannel] = useState<"form" | "chat" | null>(null);

  const trimmedQuery = query.trim();
  const searched = trimmedQuery.length > 0;
  const results = useMemo(() => searchFaq(query), [query]);
  const themePool = useMemo(() => (category ? listThemeQuestions(category) : []), [category]);
  const themeQuestions = themePool.slice(0, visibleCount);
  const allowsChat = category ? categoryAllowsChat(category) : false;
  const activeCategory = SUPPORT_CATEGORIES.find((c) => c.id === category) ?? null;

  function pickCategory(id: string) {
    setCategory(id);
    setVisibleCount(THEME_PAGE);
    setChannel(null);
  }

  return (
    <div>
      {/* Stage 1 — the search gate is the ONLY thing on the page initially. */}
      <div className="soft-card p-6" data-testid="support-search">
        <p className="soft-eyebrow">поддержка eterapy</p>
        <h1 className="soft-h1 mt-2" data-testid="support-hero-title">Центр поддержки</h1>
        <p className="mt-2 max-w-2xl text-sm" style={{ color: "var(--soft-ink-soft)" }}>
          Опишите вопрос своими словами — покажем ответ из базы знаний.
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
            placeholder="Поиск по базе знаний: возврат, подписка, доступ…"
            className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none focus-visible:outline-none"
            aria-label="Поиск по базе знаний"
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

        {searched && results.length > 0 && (
          <div className="mt-4" data-testid="support-faq-results">
            <FaqAccordion items={results} testId="support-faq-results-list" />
          </div>
        )}

        {/* Stage 2 — категории появляются после поиска: сразу при промахе, а при
            найденных статьях — ниже, для тех, кому ответ не подошёл. */}
        {searched && (
          <div className="mt-5" data-testid="support-categories">
            <p className="text-sm font-medium" style={{ color: "var(--soft-ink)" }}>
              {results.length === 0
                ? "Не нашли нужный вопрос? Выберите из категории ниже"
                : "Не подошёл ответ? Выберите категорию вопроса"}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3" role="tablist">
              {SUPPORT_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  onClick={() => pickCategory(c.id)}
                  className={`rounded-[12px] border p-3 text-left text-sm transition-colors ${
                    category === c.id
                      ? "border-[var(--soft-terracotta)] bg-[var(--soft-surface)] font-medium text-[var(--soft-bordeaux)]"
                      : "border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] text-[var(--soft-ink-soft)] hover:border-[var(--soft-bordeaux)]/40 hover:text-[var(--soft-bordeaux)]"
                  }`}
                  data-testid={`support-cat-${c.id}`}
                  aria-selected={category === c.id}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Stage 3 — вопросы выбранной категории: аккордеон, «Показать ещё»
            ДОБАВЛЯЕТ следующие 5 (не перелистывает). */}
        {searched && category && themeQuestions.length > 0 && (
          <div className="mt-4 grid gap-2" data-testid="support-theme-questions">
            <FaqAccordion items={themeQuestions} testId="support-theme-questions-list" />
            {themePool.length > visibleCount && (
              <button
                type="button"
                onClick={() => setVisibleCount((count) => count + THEME_PAGE)}
                className="justify-self-start text-sm font-medium"
                style={{ color: "var(--soft-bordeaux)" }}
                data-testid="support-theme-more"
              >
                Показать ещё вопросы →
              </button>
            )}
          </div>
        )}
      </div>

      {/* Stage 4 — эскалация ТОЛЬКО после того, как клиент прошёл категорию и
          не нашёл ответ (owner round-5 #13). */}
      {searched && category && (
        <div className="soft-card mt-4 p-6" data-testid="support-escalation">
          <h2 className="soft-h3">Не нашли ответ на свой вопрос?</h2>
          <p className="mt-2 text-sm" style={{ color: "var(--soft-ink-soft)" }}>
            Мы на связи — выберите удобный способ по теме «{activeCategory?.label}».
          </p>

          <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3" data-testid="support-escalation-actions">
            <a
              href="mailto:support@eterapy.com"
              className="rounded-[12px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4 text-left transition-colors hover:border-[var(--soft-bordeaux)]/40"
              data-testid="support-email"
            >
              <Mail className="size-4 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
              <span className="mt-2 block text-sm font-medium text-[var(--soft-ink)]">Обратиться по почте</span>
              <span className="mt-1 block text-xs" style={{ color: "var(--soft-ink-faint)" }}>ответ до 4 часов в будни</span>
            </a>

            <button
              type="button"
              onClick={() => setChannel(channel === "form" ? null : "form")}
              className={`rounded-[12px] border p-4 text-left transition-colors ${
                channel === "form"
                  ? "border-[var(--soft-terracotta)] bg-[var(--soft-surface)]"
                  : "border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] hover:border-[var(--soft-bordeaux)]/40"
              }`}
              data-testid="support-open-form"
              aria-expanded={channel === "form"}
            >
              <FileText className="size-4 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
              <span className="mt-2 block text-sm font-medium text-[var(--soft-ink)]">Заполнить форму</span>
              <span className="mt-1 block text-xs" style={{ color: "var(--soft-ink-faint)" }}>категория + описание, ответ в чате</span>
            </button>

            {allowsChat && (
              <button
                type="button"
                onClick={() => setChannel(channel === "chat" ? null : "chat")}
                className={`rounded-[12px] border p-4 text-left transition-colors ${
                  channel === "chat"
                    ? "border-[var(--soft-terracotta)] bg-[var(--soft-surface)]"
                    : "border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] hover:border-[var(--soft-bordeaux)]/40"
                }`}
                data-testid="support-open-chat"
                aria-expanded={channel === "chat"}
              >
                <MessageCircle className="size-4 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
                <span className="mt-2 block text-sm font-medium text-[var(--soft-ink)]">Написать в чат</span>
                <span className="mt-1 block text-xs" style={{ color: "var(--soft-ink-faint)" }}>для срочных и финансовых вопросов</span>
              </button>
            )}
          </div>

          {!allowsChat && (
            <p className="mt-3 text-xs" style={{ color: "var(--soft-ink-faint)" }} data-testid="support-no-chat">
              По этой теме отвечаем по почте или через форму — так быстрее и надёжнее.
            </p>
          )}

          {channel === "form" && (
            <div className="mt-4">
              <SupportRequestForm defaultCategory={category} />
            </div>
          )}

          {channel === "chat" && allowsChat && (
            showChat ? (
              <div className="mt-4" data-testid="support-live-chat">
                <SupportChat />
                <a href={telegramSupportUrl} target="_blank" rel="noopener noreferrer" className="soft-button soft-button-ghost mt-3" data-testid="support-telegram">
                  Открыть в Telegram <ArrowRight className="size-4" aria-hidden="true" />
                </a>
              </div>
            ) : (
              <p className="mt-4 text-sm" style={{ color: "var(--soft-ink-faint)" }}>
                Войдите в аккаунт, чтобы открыть чат с поддержкой по этой теме.
              </p>
            )
          )}
        </div>
      )}
    </div>
  );
}
