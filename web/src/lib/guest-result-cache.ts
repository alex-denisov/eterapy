"use client";

const STORAGE_KEY = "eterapy.guestResult.v1";
const MAX_PROMPT_LENGTH = 4_000;
const MAX_RESULT_LENGTH = 20_000;

export type GuestResultDraft = {
  tool: "CHECKIN";
  title: string;
  prompt: string;
  result: string;
  createdAt: string;
};

function hasBrowserStorage() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function trimForStorage(value: string, maxLength: number) {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

export function saveGuestResultDraft(draft: Omit<GuestResultDraft, "createdAt">) {
  if (!hasBrowserStorage()) return;
  const safeDraft: GuestResultDraft = {
    ...draft,
    prompt: trimForStorage(draft.prompt, MAX_PROMPT_LENGTH),
    result: trimForStorage(draft.result, MAX_RESULT_LENGTH),
    createdAt: new Date().toISOString(),
  };
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(safeDraft));
}

export function readGuestResultDraft(): GuestResultDraft | null {
  if (!hasBrowserStorage()) return null;
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<GuestResultDraft>;
    if (parsed.tool !== "CHECKIN" || !parsed.result || !parsed.title) return null;
    return {
      tool: "CHECKIN",
      title: parsed.title,
      prompt: parsed.prompt ?? "",
      result: parsed.result,
      createdAt: parsed.createdAt ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function clearGuestResultDraft() {
  if (!hasBrowserStorage()) return;
  window.sessionStorage.removeItem(STORAGE_KEY);
}

export async function persistGuestResultDraftToAccount() {
  const draft = readGuestResultDraft();
  if (!draft) return { saved: false as const, reason: "empty" as const };

  const response = await fetch("/api/modalities/history/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tool: draft.tool,
      title: draft.title,
      prompt: draft.prompt,
      result: draft.result,
    }),
  });

  if (!response.ok) return { saved: false as const, reason: "request_failed" as const };
  clearGuestResultDraft();
  return { saved: true as const };
}
