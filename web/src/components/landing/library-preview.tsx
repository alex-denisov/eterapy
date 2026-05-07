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
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="soft-eyebrow">библиотека анонимных вопросов</div>
          <h2 className="soft-h1 mt-2">
            С этим <em className="italic">приходят многие</em>
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
            className="soft-card flex cursor-pointer flex-col gap-3 p-5 no-underline transition-shadow hover:shadow-[0_4px_18px_-8px_rgba(60,30,20,.14)]"
          >
            <span className="soft-chip soft-chip-soft self-start px-3 py-1 text-xs">
              {entry.topic}
            </span>
            <p
              className="flex-1 text-sm italic leading-relaxed text-[var(--soft-ink-soft)]"
              style={{ fontFamily: "var(--font-heading, serif)" }}
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
