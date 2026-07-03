"use client";

import { useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { appUrl } from "@/lib/subdomain";
import { HELP_FAQ_CATS as CATS, HELP_FAQS as FAQS, type HelpFaqItem as FaqItem } from "@/lib/help-faq-data";


// KE-002 (B373): FAQPage schema.org structured data for /help, built from the
// curated FAQS above. Retired-mechanic Q&A («Маршрут 7 дней», «Круг», совместный
// «Эзотерик + психотерапевт») were removed in B373, so the structured data never
// advertises a 404'd format. Answers are flattened to single-line plain text.
const FAQ_PAGE_JSONLD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: {
      "@type": "Answer",
      text: f.a.replace(/\n+/g, " ").trim(),
    },
  })),
};

function FaqCard({ item, catLabel }: { item: FaqItem; catLabel: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="soft-card overflow-hidden"
      style={{ padding: 0, cursor: "pointer" }}
      onClick={() => setOpen(!open)}
    >
      <div className="flex items-center justify-between gap-4 px-5 py-5">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <span
            className="soft-chip shrink-0 self-start text-[10px]"
            style={{ padding: "2px 8px" }}
            onClick={(e) => e.stopPropagation()}
          >
            {catLabel}
          </span>
          <span
            className="font-heading text-base font-medium leading-snug sm:text-[1.05rem]"
            style={{ color: "var(--soft-bordeaux)" }}
          >
            {item.q}
          </span>
        </div>
        <span
          className="shrink-0 text-2xl font-light transition-transform duration-200"
          style={{
            color: "var(--soft-terracotta-dark)",
            transform: open ? "rotate(45deg)" : "none",
            fontWeight: 300,
            lineHeight: 1,
          }}
          aria-hidden="true"
        >
          +
        </span>
      </div>
      {open && (
        <div className="px-5 pb-5 pt-0">
          <p
            className="text-sm leading-relaxed"
            style={{
              color: "var(--soft-ink-soft)",
              whiteSpace: "pre-wrap",
              borderTop: "1px solid var(--soft-paper-edge)",
              paddingTop: "1rem",
            }}
          >
            {item.a}
          </p>
        </div>
      )}
    </div>
  );
}

const PAGE_STEP = 10;

// B380: /help opens with a curated set of the most-asked questions instead of
// the first 10 in array order. Search and category chips still reach all 132.
// IDs are chosen for evergreen accuracy (no renamed/removed M26 mechanics).
const TOP_FAQ_IDS = [
  "p1", "p2", "p4", "p6", "p7", "p8",
  "pr1", "pr3", "pr4", "pay4", "s1", "s2", "sf1",
];

function HelpContent() {
  const [cat, setCat] = useState("all");
  const [query, setQuery] = useState("");
  // N6: show only 10 Q&A by default; «Еще» reveals 10 more each click.
  const [visibleCount, setVisibleCount] = useState(PAGE_STEP);
  // B380: collapsed to top questions until the visitor opts into the full list.
  const [showAll, setShowAll] = useState(false);

  const topFaqs = useMemo(
    () =>
      TOP_FAQ_IDS.map((id) => FAQS.find((f) => f.id === id)).filter(
        (f): f is FaqItem => Boolean(f),
      ),
    [],
  );

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return FAQS.filter(
      (f) =>
        (cat === "all" || f.cat === cat) &&
        (!q || f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q)),
    );
  }, [cat, query]);

  // Any new filter/search resets back to the first page of 10 and to top view.
  function pickCat(next: string) {
    setCat(next);
    setVisibleCount(PAGE_STEP);
    setShowAll(false);
  }
  function updateQuery(next: string) {
    setQuery(next);
    setVisibleCount(PAGE_STEP);
    setShowAll(false);
  }

  // Default landing = curated top questions; a search/category/«показать все»
  // switches to the full paginated catalogue.
  const isTopView = cat === "all" && query.trim() === "" && !showAll;
  const source = isTopView ? topFaqs : filtered;
  const visible = isTopView ? source : source.slice(0, visibleCount);
  const hasMore = !isTopView && filtered.length > visibleCount;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6" data-testid="help-page-v42">

      {/* Hero */}
      <div className="mb-8 text-center">
        <p className="soft-eyebrow mb-3">помощь и FAQ</p>
        <h1 className="font-heading text-4xl font-semibold leading-tight sm:text-5xl" style={{ color: "var(--soft-bordeaux)" }}>
          Что бы вы <span className="italic">хотели узнать?</span>
        </h1>
      </div>

      {/* Search */}
      <div className="soft-card mb-6 flex items-center gap-3 px-4 py-3.5">
        <span style={{ color: "var(--soft-ink-faint)" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3c0 0-2 3-2 6 0 2.2 1 4 2 5M12 3c0 0 2 3 2 6 0 2.2-1 4-2 5M12 3v8M8 21l4-4 4 4"/>
          </svg>
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => updateQuery(e.target.value)}
          placeholder="Спросите своими словами — например, «как проходит разбор»"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--soft-ink-faint)]"
          style={{ fontSize: "0.9375rem", color: "var(--soft-ink)" }}
        />
        {query && (
          <button
            onClick={() => updateQuery("")}
            className="soft-chip text-[11px]"
            style={{ padding: "2px 8px" }}
          >
            ×
          </button>
        )}
      </div>

      {/* Category chips */}
      <div className="mb-6 flex flex-wrap justify-center gap-2">
        {CATS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => pickCat(id)}
            className={`soft-chip text-xs transition-colors ${cat === id ? "soft-chip-warm" : ""}`}
            style={{ padding: "5px 12px" }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Crisis banner */}
      <div
        className="soft-card mb-6 flex flex-wrap items-center gap-4 px-5 py-5"
        style={{ background: "linear-gradient(140deg, #5C2A2C, #2A1411)", border: "none" }}
      >
        <div className="flex-1" style={{ minWidth: 220 }}>
          <p className="font-heading text-lg font-medium" style={{ color: "#FBF0E1" }}>
            Если сейчас очень тяжело
          </p>
          <p className="mt-1 text-sm" style={{ color: "#E8C4B8" }}>
            ETerapy не для острых кризисов. Позвоните:
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="tel:88002000122"
            className="soft-chip font-bold"
            style={{ background: "#F4D9C1", color: "var(--soft-bordeaux)", fontSize: 13 }}
            onClick={(e) => e.stopPropagation()}
          >
            📞 8-800-2000-122
          </a>
          <a
            href="tel:112"
            className="soft-chip font-bold"
            style={{ background: "#F4D9C1", color: "var(--soft-bordeaux)", fontSize: 13 }}
            onClick={(e) => e.stopPropagation()}
          >
            112
          </a>
        </div>
      </div>

      {/* B380: curated «Популярные вопросы» heading on the default landing. */}
      {isTopView && (
        <p
          className="mb-3 text-sm font-medium"
          style={{ color: "var(--soft-ink-soft)" }}
          data-testid="help-featured-heading"
        >
          Популярные вопросы
        </p>
      )}

      {/* FAQ items */}
      <div className="space-y-2" data-testid={isTopView ? "help-featured" : "help-results"}>
        {source.length === 0 ? (
          <div className="soft-card py-12 text-center">
            <p className="font-heading text-xl italic" style={{ color: "var(--soft-ink-soft)" }}>
              Не нашли ответ?
            </p>
            <p className="mt-3 text-sm" style={{ color: "var(--soft-ink-faint)" }}>
              Напишите нам — отвечаем за 4 часа в будни.
            </p>
            <a
              href="mailto:support@eterapy.com"
              className="soft-button soft-button-primary mt-5 inline-flex"
            >
              Написать в поддержку
            </a>
          </div>
        ) : (
          visible.map((item) => (
            <FaqCard
              key={item.id}
              item={item}
              catLabel={CATS.find(([id]) => id === item.cat)?.[1] ?? item.cat}
            />
          ))
        )}
      </div>

      {/* B380: «показать все» switches the top view to the full catalogue. */}
      {isTopView && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="soft-button soft-button-ghost px-6"
            data-testid="help-show-all"
          >
            Показать все вопросы ({FAQS.length})
          </button>
        </div>
      )}

      {/* N6: «Еще» reveals the next 10 Q&A. Default page is 10. */}
      {hasMore && (
        <div className="mt-6 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => setVisibleCount((c) => c + PAGE_STEP)}
            className="soft-button soft-button-ghost px-6"
            data-testid="help-show-more"
          >
            Ещё {Math.min(PAGE_STEP, filtered.length - visibleCount)} вопрос(ов)
          </button>
          <p className="text-xs" style={{ color: "var(--soft-ink-faint)" }}>
            Показано {visible.length} из {filtered.length}
          </p>
        </div>
      )}

      {/* Contact channels */}
      <div className="mt-12 text-center">
        <h2 className="font-heading text-2xl font-semibold" style={{ color: "var(--soft-bordeaux)" }}>
          Если ответа нет — <span className="italic">напишите нам</span>
        </h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            {
              label: "Telegram",
              value: "@eterapy_support",
              desc: "Самый быстрый канал",
              bg: "linear-gradient(140deg, #DBD3EA, #E8E1F2)",
              color: "#4A3E5E",
              href: "https://t.me/eterapy_support",
            },
            {
              label: "Email",
              value: "support@eterapy.com",
              desc: "Для деталей и документов",
              bg: "linear-gradient(140deg, #F4D9C1, #F8E6D1)",
              color: "var(--soft-bordeaux)",
              href: "mailto:support@eterapy.com",
            },
            {
              // G8: бывшая «форма без email» переосмыслена — анонимная
              // форма без обратного адреса не позволяла ответить. Теперь
              // это форма жалобы в кабинете: аккаунт = обратный адрес,
              // ответ приходит в чат поддержки.
              label: "Жалоба",
              value: "форма в кабинете",
              desc: "Нарушение, оплата, приватность — ответим в чате",
              bg: "linear-gradient(140deg, #D6DECC, #E5EBDC)",
              color: "#3A4A36",
              href: appUrl("/support"),
            },
          ].map((ch) => (
            <a
              key={ch.label}
              href={ch.href}
              className="soft-card-flat block p-5 text-left transition-opacity hover:opacity-90"
              style={{ background: ch.bg, color: ch.color, border: "none" }}
            >
              <p className="font-heading text-sm font-semibold">{ch.label}</p>
              <p className="mt-1 text-base font-medium">{ch.value}</p>
              <p className="mt-1 text-xs opacity-70">{ch.desc}</p>
            </a>
          ))}
        </div>
      </div>
    </main>
  );
}

export default function HelpPage() {
  const { data: session } = useSession();
  // /help on eterapy.com is the public knowledge base, regardless of
  // auth state. The cabinet's own support entry point (tickets +
  // contacts) lives at app.eterapy.com/support and is a separate page.
  void session;
  // KE-002 (B373): FAQPage schema.org, SSR'd into the initial HTML so search
  // engines surface accurate, non-retired questions from /help. The payload is
  // built only from the static FAQS constant above (no user input), and `<` is
  // escaped to < so the JSON can never break out of the <script> element —
  // the standard, XSS-safe JSON-LD pattern (see Next.js docs + PublicJsonLd).
  const faqJsonLd = JSON.stringify(FAQ_PAGE_JSONLD).replace(/</g, "\\u003c");
  return (
    <div className="soft-clarity-page min-h-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJsonLd }} />
      <HelpContent />
    </div>
  );
}
