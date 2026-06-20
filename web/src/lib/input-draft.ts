// Platform-wide input persistence across the login round-trip (#3).
//
// When a guest fills a service form (Tarot question, natal data, perspectives
// prompt, …) and is sent to /login, the `next=` param already returns them to
// the same page — but the typed text lived only in component state and was lost.
// This stores the in-progress input in sessionStorage keyed by a stable draft
// key, so on return the form restores exactly what the user wrote.
//
// sessionStorage (not localStorage): the draft is meant for the current browsing
// session only and should not linger across days. It's cleared as soon as the
// input is consumed (result generated) or the user resets the form.

const PREFIX = "eterapy:input-draft:";

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    // Private mode / storage disabled — degrade silently to no persistence.
    return null;
  }
}

export function saveInputDraft(key: string, data: Record<string, unknown>): void {
  const store = storage();
  if (!store) return;
  try {
    const isEmpty = Object.values(data).every(
      (value) => value == null || (typeof value === "string" && value.trim() === ""),
    );
    if (isEmpty) {
      store.removeItem(PREFIX + key);
      return;
    }
    store.setItem(PREFIX + key, JSON.stringify(data));
  } catch {
    // Quota or serialization failure — non-fatal, just skip persistence.
  }
}

export function loadInputDraft<T extends Record<string, unknown>>(key: string): T | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as T) : null;
  } catch {
    return null;
  }
}

export function clearInputDraft(key: string): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}
