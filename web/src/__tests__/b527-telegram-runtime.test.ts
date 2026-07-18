import { createTelegramRuntime } from "@/lib/miniapp/telegram/client";

describe("B527 — Telegram Web App runtime", () => {
  afterEach(() => {
    delete (window as unknown as { Telegram?: unknown }).Telegram;
    document.querySelectorAll('script[src="https://telegram.org/js/telegram-web-app.js"]').forEach((script) => script.remove());
    document.documentElement.removeAttribute("style");
    delete document.documentElement.dataset.miniappTheme;
  });

  it("registers BackButton even when the Telegram SDK loads after React mounts", async () => {
    const ready = jest.fn();
    const expand = jest.fn();
    const show = jest.fn();
    const hide = jest.fn();
    const onClick = jest.fn();
    const offClick = jest.fn();
    const onEvent = jest.fn();
    const offEvent = jest.fn();

    const runtimePromise = createTelegramRuntime("/miniapp");
    const script = document.querySelector<HTMLScriptElement>(
      'script[src="https://telegram.org/js/telegram-web-app.js"]',
    );
    expect(script).not.toBeNull();

    (window as unknown as { Telegram: unknown }).Telegram = {
      WebApp: {
        ready,
        expand,
        colorScheme: "dark",
        safeAreaInset: { top: 11, bottom: 9 },
        contentSafeAreaInset: { top: 17, bottom: 13 },
        viewportStableHeight: 812,
        BackButton: { show, hide, onClick, offClick },
        onEvent,
        offEvent,
      },
    };
    script?.dispatchEvent(new Event("load"));

    const runtime = await runtimePromise;
    expect(runtime).not.toBeNull();
    expect(ready).toHaveBeenCalledTimes(1);
    expect(expand).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(hide).toHaveBeenCalledTimes(1);
    expect(document.documentElement.style.getPropertyValue("--miniapp-safe-top")).toBe("17px");
    expect(document.documentElement.style.getPropertyValue("--miniapp-safe-bottom")).toBe("13px");
    expect(document.documentElement.style.getPropertyValue("--miniapp-viewport-height")).toBe("812px");

    runtime?.updatePath("/miniapp/services");
    expect(show).toHaveBeenCalledTimes(1);

    runtime?.dispose();
    expect(offClick).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledTimes(4);
    expect(offEvent).toHaveBeenCalledTimes(4);
  });
});
