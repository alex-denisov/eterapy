import {
  LANDING_NAV,
  CABINET_BRIDGE,
  CLIENT_MOBILE_TABS,
  GUEST_MOBILE_TABS,
  CLIENT_MORE_ITEMS,
  CLIENT_MORE_SECTIONS,
  CLIENT_MORE_HREFS,
  GUEST_MORE_ITEMS,
} from "@/lib/nav-model";

// B464 IB0 — unified, state-aware navigation model. These are behaviour tests
// (not source-assertion): they lock the tab/menu composition the owner approved
// so the landing bar and the cabinet bar can never drift.

const labels = (items: { label: string }[]) => items.map((i) => i.label);

describe("B464 IB0 nav-model — landing top nav", () => {
  it("renames «Продукты» → «Разобрать» but keeps the /products route", () => {
    const services = LANDING_NAV.find((i) => i.label === "Разобрать");
    expect(services).toBeTruthy();
    expect(services?.href).toBe("/products");
    // The user-facing «Продукты» label is gone platform-wide.
    expect(labels(LANDING_NAV)).not.toContain("Продукты");
  });

  it("keeps Библиотека in the top nav for the unified IA", () => {
    expect(labels(LANDING_NAV)).toContain("Библиотека");
  });

  it("orders the nav Как работает · Разобрать · Специалисты · Тарифы · Библиотека", () => {
    expect(labels(LANDING_NAV)).toEqual([
      "Как работает",
      "Разобрать",
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
      "Разобрать",
      "Специалисты",
      "Библиотека",
    ]);
  });
});

describe("B464 IB0 nav-model — mobile bottom bar (state-aware)", () => {
  it("gives the logged-in client Главная · Вопрос · Разобрать · Дневник · Ещё", () => {
    expect(labels(CLIENT_MOBILE_TABS)).toEqual([
      "Главная",
      "Вопрос",
      "Разобрать",
      "Дневник",
      "Ещё",
    ]);
  });

  it("gives the guest Войти · Вопрос · Разобрать · Специалисты · Ещё (slot 1 = Войти)", () => {
    expect(labels(GUEST_MOBILE_TABS)).toEqual([
      "Войти",
      "Вопрос",
      "Разобрать",
      "Специалисты",
      "Ещё",
    ]);
  });

  it("routes «Вопрос» to /checkin and «Разобрать» to /products (the free door + services)", () => {
    const q = CLIENT_MOBILE_TABS.find((t) => t.label === "Вопрос");
    const s = CLIENT_MOBILE_TABS.find((t) => t.label === "Разобрать");
    expect(q?.href).toContain("/checkin");
    expect(s?.href).toContain("/products");
  });

  it("B512: client «Ещё» NAVIGATES to the /cabinet/more hub; guest keeps the sheet", () => {
    expect(CLIENT_MOBILE_TABS.at(-1)?.label).toBe("Ещё");
    expect(CLIENT_MOBILE_TABS.at(-1)?.href).toContain("/more");
    expect(GUEST_MOBILE_TABS.at(-1)?.label).toBe("Ещё");
    expect(GUEST_MOBILE_TABS.at(-1)?.href).toBe("");
  });
});

describe("B512 nav-model — client «Ещё» hub sections", () => {
  it("groups the hub into Кабинет · Платформа · Аккаунт", () => {
    expect(CLIENT_MORE_SECTIONS.map((s) => s.heading)).toEqual([
      "Кабинет",
      "Платформа",
      "Аккаунт",
    ]);
    expect(labels(CLIENT_MORE_SECTIONS[0].items)).toEqual([
      "Записи",
      "Сообщения",
      "Кошелёк",
      "Приглашения",
    ]);
    expect(labels(CLIENT_MORE_SECTIONS[1].items)).toEqual([
      "Разобрать",
      "Специалисты",
      "Библиотека",
    ]);
    expect(labels(CLIENT_MORE_SECTIONS[2].items)).toEqual([
      "Настройки",
      "Поддержка",
    ]);
  });

  it("drops the bare «На сайт» row — «Платформа» covers the cross-shell exits", () => {
    const more = labels(CLIENT_MORE_ITEMS);
    expect(more).not.toContain("На сайт");
    expect(more).toContain("Выйти");
    // Primary personal tabs are still not repeated in the hub.
    expect(more).not.toContain("Главная");
    expect(more).not.toContain("Дневник");
    // «Подписка и оплата» stays merged into Кошелёк (IB3).
    expect(more).not.toContain("Подписка и оплата");
    expect(more).not.toContain("Подписка");
  });

  it("routes «Платформа» rows to the landing (mainUrl), cabinet rows to the app", () => {
    for (const item of CLIENT_MORE_SECTIONS[1].items) {
      expect(item.href).not.toContain("app.");
    }
  });

  it("keeps the «Ещё» umbrella active-state hrefs in sync with the hub pages", () => {
    expect(CLIENT_MORE_HREFS.some((href) => href.includes("/more"))).toBe(true);
    for (const label of ["/bookings", "/messages", "/wallet", "/invite", "/settings", "/support"]) {
      expect(CLIENT_MORE_HREFS.some((href) => href.includes(label))).toBe(true);
    }
  });

  it("guest «Ещё» = Как работает · Библиотека · Тарифы (Войти is already a tab)", () => {
    expect(labels(GUEST_MORE_ITEMS)).toEqual([
      "Как работает",
      "Библиотека",
      "Тарифы",
    ]);
  });
});
