import {
  clearGuestResultDraft,
  persistGuestResultDraftToAccount,
  readGuestResultDraft,
  saveGuestResultDraft,
} from "@/lib/guest-result-cache";

describe("guest result cache", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    window.sessionStorage.clear();
    global.fetch = jest.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("stores a bounded guest check-in result in the current tab", () => {
    saveGuestResultDraft({
      tool: "CHECKIN",
      title: "Первичный ответ",
      prompt: "Что меня беспокоит?",
      result: "Гостевой ответ",
    });

    expect(readGuestResultDraft()).toEqual(
      expect.objectContaining({
        tool: "CHECKIN",
        title: "Первичный ответ",
        prompt: "Что меня беспокоит?",
        result: "Гостевой ответ",
      })
    );
  });

  it("persists the guest result to authenticated history and clears the cache", async () => {
    saveGuestResultDraft({
      tool: "CHECKIN",
      title: "Первичный ответ",
      prompt: "Контекст",
      result: "Ответ",
    });
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

    await expect(persistGuestResultDraftToAccount()).resolves.toEqual({ saved: true });

    expect(global.fetch).toHaveBeenCalledWith("/api/modalities/history/save", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        tool: "CHECKIN",
        title: "Первичный ответ",
        prompt: "Контекст",
        result: "Ответ",
      }),
    }));
    expect(readGuestResultDraft()).toBeNull();
  });

  it("keeps the cached result if account persistence fails", async () => {
    saveGuestResultDraft({
      tool: "CHECKIN",
      title: "Первичный ответ",
      prompt: "Контекст",
      result: "Ответ",
    });
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false });

    await expect(persistGuestResultDraftToAccount()).resolves.toEqual({ saved: false, reason: "request_failed" });

    expect(readGuestResultDraft()).toEqual(expect.objectContaining({ result: "Ответ" }));
    clearGuestResultDraft();
    expect(readGuestResultDraft()).toBeNull();
  });
});
