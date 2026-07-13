"use client";

import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { SoftMarkdown } from "@/components/ui/soft-markdown";
import type { ReportSection } from "@/lib/report-sections";

function sectionPreview(body: string) {
  return body
    .replace(/^#{1,6}\s+.*$/gm, "")
    .replace(/[*_`>\[\]]/g, "")
    .replace(/^\s*(?:[-+•]|\d{1,3}[.)])\s*$/gm, "")
    .replace(/^\s*(?:[-+•]|\d{1,3}[.)])\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)[0]
    ?.slice(0, 150) ?? "";
}

// Навигация по длинному разбору: аккордеон по главам, открыт только один блок.
// При раскрытии другой главы предыдущая сворачивается, а экран переходит к началу
// открытой главы (она фиксируется сверху), чтобы не было видно, как сворачивается
// предыдущая. Общий компонент для deep-report / natal-chart / др. услуг.
export function SectionAccordion({
  sections,
  testId = "section-accordion",
  itemTestId = "section-accordion-item",
}: {
  sections: ReportSection[];
  testId?: string;
  itemTestId?: string;
}) {
  const [openIndex, setOpenIndex] = useState(0);
  const headerRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function toggle(i: number) {
    const next = openIndex === i ? -1 : i;
    setOpenIndex(next);
    if (next === i) {
      requestAnimationFrame(() => headerRefs.current[i]?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  return (
    <div className="flex flex-col gap-2.5" data-testid={testId}>
      {sections.map((section, i) => {
        const open = openIndex === i;
        const preview = sectionPreview(section.body);
        return (
          <div
            key={i}
            className="overflow-hidden rounded-[16px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper)]"
            data-testid={itemTestId}
            data-open={open}
          >
            <button
              type="button"
              ref={(el) => { headerRefs.current[i] = el; }}
              onClick={() => toggle(i)}
              aria-expanded={open}
              className="flex w-full scroll-mt-20 items-center gap-3 px-4 py-3.5 text-left sm:px-5"
            >
              <span className="font-heading text-sm italic text-[var(--soft-terracotta-dark)]">{String(i + 1).padStart(2, "0")}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-heading text-[1.05rem] font-semibold text-[var(--soft-ink)]">{section.title}</span>
                {preview && <span className="mt-1 block text-xs leading-relaxed text-[var(--soft-ink-faint)]">{preview}</span>}
              </span>
              <ChevronDown className={`size-4 shrink-0 text-[var(--soft-ink-faint)] transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
            {open && (
              <div className="border-t border-[var(--soft-paper-edge)] px-4 pb-5 pt-3 sm:px-5">
                <SoftMarkdown content={section.body} className="text-[15px] leading-relaxed text-[var(--soft-ink)]" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
