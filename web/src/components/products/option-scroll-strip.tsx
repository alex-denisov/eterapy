"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Горизонтально прокручиваемая лента выбора в дизайне Таро (.tarot-strip /
// .tarot-strip-track / .tarot-choice). Вынесена для переиспользования в услугах
// «Переосмысление» и «Подробный разбор», чтобы блоки выбора темы и характера
// вопроса выглядели идентично таро. Стрелка появляется только если есть куда
// скроллить; клик плавно сдвигает ленту.
export function OptionScrollStrip({ children, ariaLabel }: { children: ReactNode; ariaLabel: string }) {
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
    <div className="tarot-strip">
      {canLeft && (
        <button
          type="button"
          className="tarot-strip-arrow tarot-strip-arrow-left"
          onClick={() => scrollByDir(-1)}
          aria-label="Прокрутить влево"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
      )}
      <div ref={ref} className="tarot-strip-track" role="group" aria-label={ariaLabel} onScroll={update}>
        {children}
      </div>
      {canRight && (
        <button
          type="button"
          className="tarot-strip-arrow tarot-strip-arrow-right"
          onClick={() => scrollByDir(1)}
          aria-label="Прокрутить вправо"
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

// Одна кнопка-чип ленты в дизайне Таро (.tarot-choice / .tarot-choice-active).
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
      className={active ? "tarot-choice tarot-choice-active" : "tarot-choice"}
      onClick={onClick}
      aria-pressed={active}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
}
