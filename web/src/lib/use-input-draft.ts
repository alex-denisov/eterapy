"use client";

import { useEffect, useRef } from "react";
import { clearInputDraft, loadInputDraft, saveInputDraft } from "@/lib/input-draft";

// Reusable wiring for #3 (input survives the /login round-trip), so every
// service form gets it the same way: restore once on mount, then save on change.
//
// - `restore` is called once with the stored draft (if any) so the component can
//   re-apply its fields.
// - while `active` is false (e.g. a result is already shown) we stop saving, so
//   the result state never overwrites the user's in-progress draft.
// - `clear()` lets the caller drop the draft once it's consumed or reset.
//
// A ref (not state) gates "already restored" so the hook never calls setState
// in an effect and never mutates a ref during render.
export function useInputDraft<T extends Record<string, unknown>>(
  key: string,
  values: T,
  restore: (draft: T) => void,
  options?: { active?: boolean },
): { clear: () => void } {
  const active = options?.active ?? true;
  const restoredRef = useRef(false);

  useEffect(() => {
    const draft = loadInputDraft<T>(key);
    if (draft) restore(draft);
    restoredRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const serialized = JSON.stringify(values);
  useEffect(() => {
    if (!restoredRef.current || !active) return;
    saveInputDraft(key, values);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized, active, key]);

  return { clear: () => clearInputDraft(key) };
}
