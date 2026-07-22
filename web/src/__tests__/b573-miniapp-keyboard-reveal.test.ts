import { createTelegramRuntime } from "@/lib/miniapp/telegram/client";

// B573 (owner 2026-07-22): «на экранах услуг при фокусе в поле, которое ниже
// края клавиатуры, экран не переходит к полю — приходится листать вслепую».
//
// В Telegram WebApp клавиатура НЕ меняет `window.innerHeight`, поэтому браузер
// не считает поле перекрытым и штатный автоскролл не срабатывает вовсе. Экран
// уже умеет мерить клавиатуру (`data-miniapp-keyboard-open`), но только чтобы
// пересчитать высоту — к полю он не подъезжал никогда.

type ViewportStub = EventTarget & { height: number };

function stubVisualViewport(height: number) {
  const viewport = new EventTarget() as ViewportStub;
  Object.defineProperty(viewport, "height", { configurable: true, writable: true, value: height });
  Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
  return viewport;
}

function telegramStub(viewportHeight: number) {
  (window as unknown as { Telegram: unknown }).Telegram = {
    WebApp: {
      viewportHeight,
      viewportStableHeight: viewportHeight,
      BackButton: { show: jest.fn(), hide: jest.fn(), onClick: jest.fn(), offClick: jest.fn() },
      onEvent: jest.fn(),
      offEvent: jest.fn(),
    },
  };
}

describe("B573 — поле под клавиатурой подъезжает к экрану", () => {
  const originalViewport = Object.getOwnPropertyDescriptor(window, "visualViewport");

  afterEach(() => {
    delete (window as unknown as { Telegram?: unknown }).Telegram;
    document.querySelectorAll('script[src="https://telegram.org/js/telegram-web-app.js"]').forEach((s) => s.remove());
    document.body.replaceChildren();
    document.documentElement.removeAttribute("style");
    delete document.documentElement.dataset.miniappKeyboardOpen;
    if (originalViewport) Object.defineProperty(window, "visualViewport", originalViewport);
    else delete (window as unknown as { visualViewport?: unknown }).visualViewport;
    jest.useRealTimers();
  });

  it("подъезжает к полю, когда клавиатура открылась", async () => {
    jest.useFakeTimers();
    const viewport = stubVisualViewport(812);
    telegramStub(812);

    const field = document.createElement("textarea");
    const scrollIntoView = jest.fn();
    field.scrollIntoView = scrollIntoView;
    document.body.appendChild(field);

    const runtime = await createTelegramRuntime("/miniapp/products/reframe");

    field.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    // Клавиатура ещё не поднялась — двигать экран не за чем.
    jest.runOnlyPendingTimers();
    expect(scrollIntoView).not.toHaveBeenCalled();

    viewport.height = 420;
    viewport.dispatchEvent(new Event("resize"));
    jest.runOnlyPendingTimers();

    expect(document.documentElement.dataset.miniappKeyboardOpen).toBe("true");
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });

    runtime?.dispose();
  });

  it("не трогает живой диалог: там композер уже прибит к вьюпорту", async () => {
    jest.useFakeTimers();
    const viewport = stubVisualViewport(812);
    telegramStub(812);

    // `.soft-chat-screen` — контракт живого чата (B561): тред ограничен по
    // высоте, композер прижат. scrollIntoView там дёргает весь фрейм вверх,
    // ровно это уже ловили в `companion-chat-panel`.
    const frame = document.createElement("div");
    frame.className = "soft-chat-screen";
    const field = document.createElement("textarea");
    const scrollIntoView = jest.fn();
    field.scrollIntoView = scrollIntoView;
    frame.appendChild(field);
    document.body.appendChild(frame);

    const runtime = await createTelegramRuntime("/miniapp/checkin");
    field.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    viewport.height = 420;
    viewport.dispatchEvent(new Event("resize"));
    jest.runOnlyPendingTimers();

    expect(document.documentElement.dataset.miniappKeyboardOpen).toBe("true");
    expect(scrollIntoView).not.toHaveBeenCalled();

    runtime?.dispose();
  });

  it("забывает поле после ухода фокуса и после dispose", async () => {
    jest.useFakeTimers();
    const viewport = stubVisualViewport(812);
    telegramStub(812);

    const field = document.createElement("input");
    const scrollIntoView = jest.fn();
    field.scrollIntoView = scrollIntoView;
    document.body.appendChild(field);

    const runtime = await createTelegramRuntime("/miniapp/products/reframe");
    field.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    field.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));

    viewport.height = 420;
    viewport.dispatchEvent(new Event("resize"));
    jest.runOnlyPendingTimers();
    expect(scrollIntoView).not.toHaveBeenCalled();

    // После dispose слушатели сняты — фокус больше ничего не планирует.
    runtime?.dispose();
    field.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    viewport.height = 400;
    viewport.dispatchEvent(new Event("resize"));
    jest.runOnlyPendingTimers();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("не считает клавиатурой кнопку или ссылку в фокусе", async () => {
    jest.useFakeTimers();
    const viewport = stubVisualViewport(812);
    telegramStub(812);

    const button = document.createElement("button");
    const scrollIntoView = jest.fn();
    button.scrollIntoView = scrollIntoView;
    document.body.appendChild(button);

    const runtime = await createTelegramRuntime("/miniapp/products/reframe");
    button.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    viewport.height = 420;
    viewport.dispatchEvent(new Event("resize"));
    jest.runOnlyPendingTimers();

    expect(scrollIntoView).not.toHaveBeenCalled();
    runtime?.dispose();
  });
});
