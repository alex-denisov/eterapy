"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Shared horizontally scrollable selector for compact product controls.
export function OptionScrollStrip({
  children,
  ariaLabel,
  label,
  hint,
}: {
  children: ReactNode;
  ariaLabel: string;
  label?: string;
  hint?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 2);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [update]);

  function scrollByDir(direction: 1 | -1) {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.7, behavior: "smooth" });
  }

  return (
    <div className={label ? "product-option-group" : undefined}>
      {label && (
        <div className="mb-2">
          <p className="soft-eyebrow product-question-label !mt-0">{label}</p>
          {hint && <p className="mt-1 text-xs leading-relaxed text-[var(--soft-ink-faint)]">{hint}</p>}
        </div>
      )}
      <div className="product-option-strip">
        {canLeft && (
          <button
            type="button"
            className="product-option-strip-arrow product-option-strip-arrow-left"
            onClick={() => scrollByDir(-1)}
            aria-label="Прокрутить влево"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
        )}
        <div ref={ref} className="product-option-strip-track" role="group" aria-label={ariaLabel} onScroll={update}>
          {children}
        </div>
        {canRight && (
          <button
            type="button"
            className="product-option-strip-arrow product-option-strip-arrow-right"
            onClick={() => scrollByDir(1)}
            aria-label="Прокрутить вправо"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

// One chip inside a shared option strip.
export function OptionChoice({
  active,
  onClick,
  disabled,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={active ? "product-option-choice product-option-choice-active" : "product-option-choice"}
      onClick={onClick}
      aria-pressed={active}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
}
