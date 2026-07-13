"use client";

import { useEffect, useState } from "react";

// Rotates examples without ever touching the client's value. A changed context
// (for example, another topic chip) restarts at its clearest example.
export function useRotatingPlaceholder(
  examples: readonly string[],
  contextKey = "default",
  intervalMs = 3_600,
) {
  const [state, setState] = useState({ contextKey, index: 0 });
  const index = state.contextKey === contextKey ? state.index : 0;

  useEffect(() => {
    if (examples.length < 2) return;
    const timer = window.setInterval(() => {
      setState((current) => ({
        contextKey,
        index: current.contextKey === contextKey ? (current.index + 1) % examples.length : 1 % examples.length,
      }));
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [contextKey, examples, intervalMs]);

  return examples[index % Math.max(examples.length, 1)] ?? "";
}
