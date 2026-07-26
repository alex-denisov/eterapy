// B390 (M26) — вирусные поверхности: шеринг + TG deep-links. Проверяем чистую
// логику (разбор start-параметра, deep-link, сборку ссылок/OG и тексты шеринга).

import {
  getMiniAppStartParam,
  parseMiniAppDeepLink,
  deepLinkToPath,
} from "@/lib/miniapp";
import {
  SHARE_EVENTS,
  ogImageUrl,
  withReferral,
  telegramDeepLink,
  libraryStartParam,
  shareText,
} from "@/lib/share";

describe("TG deep-link start-параметр", () => {
  it("читает ?startapp= и ?start=", () => {
    expect(getMiniAppStartParam({ search: "?startapp=lib-test" })).toBe("lib-test");
    expect(getMiniAppStartParam({ search: "?start=lib-test" })).toBe("lib-test");
  });

  it("читает tgWebAppStartParam из хеша запуска", () => {
    expect(getMiniAppStartParam({ hash: "#tgWebAppData=x&tgWebAppStartParam=lib-money-fear" })).toBe("lib-money-fear");
  });

  it("нет параметра → null", () => {
    expect(getMiniAppStartParam({ search: "?foo=bar", hash: "#baz" })).toBeNull();
  });
});

describe("разбор deep-link в навигацию", () => {
  it("lib-<slug> → карточка библиотеки", () => {
    expect(parseMiniAppDeepLink("lib-hozhu-po-krugu")).toEqual({ kind: "library", slug: "hozhu-po-krugu" });
    expect(deepLinkToPath(parseMiniAppDeepLink("lib-hozhu-po-krugu"))).toBe("/library/hozhu-po-krugu");
  });

  it("отклоняет небезопасные слаги и неизвестные префиксы", () => {
    expect(parseMiniAppDeepLink("lib-../../etc")).toBeNull();
    expect(parseMiniAppDeepLink("lib-")).toBeNull();
    expect(parseMiniAppDeepLink("evil-thing")).toBeNull();
    expect(parseMiniAppDeepLink(null)).toBeNull();
    expect(deepLinkToPath(null)).toBeNull();
  });

  it("round-trip: libraryStartParam ↔ parseMiniAppDeepLink", () => {
    const slug = "trevoga-i-sostoyanie";
    const param = libraryStartParam(slug);
    expect(param).toBe("lib-trevoga-i-sostoyanie");
    expect(parseMiniAppDeepLink(param)).toEqual({ kind: "library", slug });
  });
});

describe("сборка ссылок шеринга и OG", () => {
  it("ogImageUrl по типу артефакта", () => {
    expect(ogImageUrl("library")).toBe("/api/og?kind=library");
    expect(ogImageUrl("human-design")).toBe("/api/og?kind=human-design");
  });

  it("withReferral добавляет ?ref= корректно (с учётом существующего query)", () => {
    expect(withReferral("https://x/y", "hd-type")).toBe("https://x/y?ref=hd-type");
    expect(withReferral("https://x/y?a=1", "hd-type")).toBe("https://x/y?a=1&ref=hd-type");
  });

  it("telegramDeepLink без env → web-фолбэк", () => {
    const prev = process.env.NEXT_PUBLIC_TG_MINIAPP_URL;
    delete process.env.NEXT_PUBLIC_TG_MINIAPP_URL;
    expect(telegramDeepLink("lib-x", "https://app.eterapy.com/library/x")).toBe("https://app.eterapy.com/library/x");
    if (prev) process.env.NEXT_PUBLIC_TG_MINIAPP_URL = prev;
  });

  it("telegramDeepLink с env → t.me startapp", () => {
    const prev = process.env.NEXT_PUBLIC_TG_MINIAPP_URL;
    process.env.NEXT_PUBLIC_TG_MINIAPP_URL = "https://t.me/eterapy_bot/app";
    expect(telegramDeepLink("lib-x", "https://w/x")).toBe("https://t.me/eterapy_bot/app?startapp=lib-x");
    if (prev) process.env.NEXT_PUBLIC_TG_MINIAPP_URL = prev;
    else delete process.env.NEXT_PUBLIC_TG_MINIAPP_URL;
  });

  it("тексты шеринга по типу артефакта", () => {
    expect(shareText("human-design", "Генератор")).toContain("Дизайн");
    expect(shareText("library", "Повторяется одно и то же")).toContain("Повторяется одно и то же");
    expect(shareText("weekly-summary", "")).toContain("итог недели");
  });

  it("имена KPI-событий стабильны", () => {
    expect(SHARE_EVENTS).toEqual({
      generated: "share_generated",
      opened: "share_opened",
      referredDialogue: "referred_dialogue_started",
    });
  });
});
