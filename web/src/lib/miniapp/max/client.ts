export type MaxWebApp = {
  initData?: string;
  initDataUnsafe?: { user?: { first_name?: string; id?: number; username?: string } };
  colorScheme?: "light" | "dark";
  platform?: string;
  ready?: () => void;
  expand?: () => void;
  close?: () => void;
  BackButton?: {
    show: () => void;
    hide: () => void;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
  };
};

const MAX_SDK_SRC = "https://st.max.ru/js/max-web-app.js";

function currentMaxWebApp(): MaxWebApp | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { WebApp?: MaxWebApp }).WebApp;
}

export function loadMaxSdk(): Promise<MaxWebApp | undefined> {
  return new Promise((resolve) => {
    const ready = currentMaxWebApp();
    if (ready) {
      ready.ready?.();
      ready.expand?.();
      return resolve(ready);
    }
    const prior = document.querySelector<HTMLScriptElement>(`script[src="${MAX_SDK_SRC}"]`);
    if (prior) {
      prior.addEventListener(
        "load",
        () => {
          const app = currentMaxWebApp();
          app?.ready?.();
          app?.expand?.();
          resolve(app);
        },
        { once: true },
      );
      prior.addEventListener("error", () => resolve(undefined), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = MAX_SDK_SRC;
    script.async = true;
    script.addEventListener(
      "load",
      () => {
        const app = currentMaxWebApp();
        app?.ready?.();
        app?.expand?.();
        resolve(app);
      },
      { once: true },
    );
    script.addEventListener("error", () => resolve(undefined), { once: true });
    document.head.appendChild(script);
  });
}
