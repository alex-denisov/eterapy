import {
  LANDING_NAV,
  CABINET_BRIDGE,
  CLIENT_MOBILE_TABS,
  GUEST_MOBILE_TABS,
  CLIENT_MORE_ITEMS,
  GUEST_MORE_ITEMS,
} from "@/lib/nav-model";

// B464 IB0 — unified, state-aware navigation model. These are behaviour tests
// (not source-assertion): they lock the tab/menu composition the owner approved
// so the landing bar and the cabinet bar can never drift.

const labels = (items: { label: string }[]) => items.map((i) => i.label);

describe("B464 IB0 nav-model — landing top nav", () => {
  it("renames «Продукты» → «Услуги» but keeps the /products route", () => {
    const services = LANDING_NAV.find((i) => i.label === "Услуги");
    expect(services).toBeTruthy();
    expect(services?.href).toBe("/products");
    // The user-facing «Продукты» label is gone platform-wide.
    expect(labels(LANDING_NAV)).not.toContain("Продукты");
  });

  it("keeps Библиотека in the top nav for the unified IA", () => {
    expect(labels(LANDING_NAV)).toContain("Библиотека");
  });

  it("orders the nav Как работает · Услуги · Специалисты · Тарифы · Библиотека", () => {
    expect(labels(LANDING_NAV)).toEqual([
      "Как работает",
      "Услуги",
      "Специалисты",
      "Тарифы",
      "Библиотека",
    ]);
  });
});

describe("B464 IB0 nav-model — cabinet service bridge", () => {
  it("fills the in-cabinet header centre with cross-shell service links", () => {
    expect(labels(CABINET_BRIDGE)).toEqual([
      "На сайт",
      "Услуги",
      "Специалисты",
      "Библиотека",
    ]);
  });
});

describe("B464 IB0 nav-model — mobile bottom bar (state-aware)", () => {
  it("gives the logged-in client Главная · Вопрос · Услуги · Дневник · Ещё", () => {
    expect(labels(CLIENT_MOBILE_TABS)).toEqual([
      "Главная",
      "Вопрос",
      "Услуги",
      "Дневник",
      "Ещё",
    ]);
  });

  it("gives the guest Войти · Вопрос · Услуги · Специалисты · Ещё (slot 1 = Войти)", () => {
    expect(labels(GUEST_MOBILE_TABS)).toEqual([
      "Войти",
      "Вопрос",
      "Услуги",
      "Специалисты",
      "Ещё",
    ]);
  });

  it("routes «Вопрос» to /checkin and «Услуги» to /products (the free door + services)", () => {
    const q = CLIENT_MOBILE_TABS.find((t) => t.label === "Вопрос");
    const s = CLIENT_MOBILE_TABS.find((t) => t.label === "Услуги");
    expect(q?.href).toContain("/checkin");
    expect(s?.href).toContain("/products");
  });

  it("marks the last tab «Ещё» so the component can open a sheet instead of navigating", () => {
    expect(CLIENT_MOBILE_TABS.at(-1)?.label).toBe("Ещё");
    expect(GUEST_MOBILE_TABS.at(-1)?.label).toBe("Ещё");
  });
});

describe("B464 IB0 nav-model — «Ещё» sheet contents", () => {
  it("client «Ещё» carries the secondary cabinet pages without duplicating tabs", () => {
    const more = labels(CLIENT_MORE_ITEMS);
    expect(more).toEqual(
      expect.arrayContaining([
        "Записи",
        "Кошелёк",
        "Приглашения",
        "Настройки",
        "Поддержка",
        "На сайт",
        "Выйти",
      ]),
    );
    // Primary tabs must not be repeated in the sheet.
    expect(more).not.toContain("Главная");
    expect(more).not.toContain("Дневник");
    // «Подписка и оплата» is merged into Кошелёк (IB3) — no separate entry.
    expect(more).not.toContain("Подписка и оплата");
    expect(more).not.toContain("Подписка");
  });

  it("guest «Ещё» = Как работает · Библиотека · Тарифы (Войти is already a tab)", () => {
    expect(labels(GUEST_MORE_ITEMS)).toEqual([
      "Как работает",
      "Библиотека",
      "Тарифы",
    ]);
  });
});
