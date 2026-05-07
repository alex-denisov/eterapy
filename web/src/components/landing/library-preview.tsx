import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { anonymousLibraryEntries } from "@/data/anonymous-library";

const PREVIEW_SLUGS = [
  "ne-mogu-reshitsya-na-razgovor",
  "stoyu-pered-vyborom-raboty",
  "povtoryaetsya-odin-i-tot-zhe-scenariy",
];

export function LibraryPreviewSection() {
  const entries = PREVIEW_SLUGS
    .map((slug) => anonymousLibraryEntries.find((e) => e.slug === slug))
    .filter(Boolean) as typeof anonymousLibraryEntries;

  return (
    <section className="soft-shell py-16 md:py-24">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="soft-eyebrow">библиотека анонимных вопросов</div>
          <h2 className="soft-h1 mt-2">
            С этим <span className="soft-italic">приходят многие</span>
          </h2>
        </div>
        <Link href="/library" className="soft-button soft-button-ghost">
          Открыть библиотеку
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {entries.map((entry) => (
          <Link
            key={entry.slug}
            href={`/library/${entry.slug}`}
            className="soft-card soft-question-card flex cursor-pointer flex-col gap-3 p-5 no-underline"
          >
            <span className="soft-chip soft-chip-warm self-start" style={{ fontSize: 13, padding: "4px 9px" }}>
              {entry.topic}
            </span>
            <p
              className="flex-1 italic leading-snug text-[var(--soft-ink)]"
              style={{ fontFamily: "var(--font-heading, serif)", fontSize: 19, lineHeight: 1.35 }}
            >
              «{entry.question}»
            </p>
            <div className="flex gap-1.5 text-[11px] text-[var(--soft-ink-faint)]">
              <span>{entry.reactions.toLocaleString("ru")} прошли похожий разбор</span>
              <span>·</span>
              <span>анонимно</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
