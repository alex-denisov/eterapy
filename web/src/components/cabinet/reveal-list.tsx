"use client";

import { Children, useState, type ReactNode } from "react";

// B464 round-4 #12 — the owner's «последние 4 + показать ещё» pattern for long
// lists. Server-rendered children pass straight through the client boundary;
// this wrapper only controls how many are visible (+step per click).
export function RevealList({
  children,
  initial = 4,
  step = 4,
  className,
  moreLabel = "Показать ещё",
}: {
  children: ReactNode;
  initial?: number;
  step?: number;
  className?: string;
  moreLabel?: string;
}) {
  const items = Children.toArray(children);
  const [visible, setVisible] = useState(initial);

  return (
    <div data-testid="reveal-list">
      <div className={className}>{items.slice(0, visible)}</div>
      {items.length > visible && (
        <button
          type="button"
          onClick={() => setVisible((v) => v + step)}
          className="soft-button soft-button-ghost mt-3 w-full"
          style={{ minHeight: "2.25rem", fontSize: "0.875rem" }}
          data-testid="reveal-list-more"
        >
          {moreLabel} ({items.length - visible})
        </button>
      )}
    </div>
  );
}
