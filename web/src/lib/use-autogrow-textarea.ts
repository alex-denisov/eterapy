import { useCallback, useLayoutEffect, useRef } from "react";

// Telegram-like composer input: the textarea starts at one line and grows with
// content up to `maxRows` lines, after which it scrolls (CSS `max-height` clamps
// the grown height and `overflow-y: auto` takes over). The CSS sets the 1-line
// floor and the 4-line ceiling; this hook only sizes the height to the content so
// the box hugs exactly what the user typed. Shared by the /chat and /checkin
// composers, both of which mount their textarea conditionally — so we size on
// attach via a callback ref AND on every value change via a layout effect.
export function useAutoGrowTextarea(value: string) {
  const nodeRef = useRef<HTMLTextAreaElement | null>(null);

  const resizeNode = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    // Reset first so shrinking (e.g. after the field is cleared on send) measures
    // the true content height instead of the previously grown height.
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  const resize = useCallback(() => resizeNode(nodeRef.current), []);

  // Callback ref: fires when the textarea mounts (and on unmount with null), so a
  // composer that appears later still starts sized to one line.
  const ref = useCallback((node: HTMLTextAreaElement | null) => {
    nodeRef.current = node;
    resizeNode(node);
  }, []);

  // useLayoutEffect so the box is sized before paint — no one-frame flash of the
  // default height — whenever the controlled value changes (typing / clearing).
  useLayoutEffect(() => {
    resize();
  }, [value, resize]);

  return { ref, resize };
}
