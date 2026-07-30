/**
 * B620 — Дзен через размеченную RSS-ленту.
 *
 * Проверяется разметка, которую требует площадка, и честность выпуска: лента —
 * это pull, поэтому публичного адреса в момент передачи ещё нет, и придумывать
 * его нельзя.
 */

import {
  buildDzenFeed,
  DZEN_FEED_MINIMUM_ITEMS,
  dzenAnnounce,
  dzenBodyHtml,
  dzenFeedGuid,
  rfc822,
} from "@/lib/marketing/dzen-feed";

const item = {
  key: "b610-dzen-2026-07-30",
  title: "Сон про опоздание: что он обычно означает",
  body: "Первый абзац наблюдения.\n\nВторой абзац с разбором.\n\nТретий абзац и шаг.",
  link: "https://eterapy.com/library/sny/opozdanie",
  mediaUrl: "https://eterapy.com/api/marketing/media/b610-dzen-2026-07-30",
  publishedAt: new Date("2026-07-30T08:15:00Z"),
  cluster: "сны",
};

describe("B620 · разметка ленты", () => {
  const feed = buildDzenFeed({
    items: [item],
    channelUrl: "https://dzen.ru/eterapy",
    now: new Date("2026-07-30T09:00:00Z"),
  });

  it("объявляет пространство content:encoded — без него Дзен не видит текст", () => {
    expect(feed).toContain('xmlns:content="http://purl.org/rss/1.0/modules/content/"');
    expect(feed).toContain("<content:encoded>");
  });

  it("полный текст едет разметкой, анонс — отдельно", () => {
    expect(feed).toContain("<p>Первый абзац наблюдения.</p>");
    expect(feed).toContain("<description>Первый абзац наблюдения. Второй абзац");
  });

  it("обложка передаётся enclosure, а не только внутри текста", () => {
    expect(feed).toContain(`<enclosure url="${item.mediaUrl}" type="image/png" />`);
  });

  it("дата выпуска в формате RFC-822", () => {
    expect(feed).toContain("<pubDate>Thu, 30 Jul 2026 08:15:00 +0000</pubDate>");
    expect(rfc822(new Date("2026-01-04T05:06:07Z"))).toBe("Sun, 04 Jan 2026 05:06:07 +0000");
  });

  it("guid стабилен и не выдаёт себя за адрес страницы", () => {
    expect(feed).toContain(`<guid isPermaLink="false">${dzenFeedGuid(item.key)}</guid>`);
  });

  it("ссылка ведёт в реестр URL B600, чтобы переходы считались", () => {
    expect(feed).toContain(`<link>${item.link}</link>`);
  });

  it("разметка внутри текста экранируется, а не ломает документ", () => {
    const risky = buildDzenFeed({
      items: [{ ...item, title: "Таро & «сны» <не> гадание", body: "Текст с ]]> внутри." }],
      channelUrl: "https://dzen.ru/eterapy",
      now: new Date("2026-07-30T09:00:00Z"),
    });
    expect(risky).toContain("<title>Таро &amp; «сны» &lt;не&gt; гадание</title>");
    expect(risky).not.toContain("]]>\n");
  });

  it("порог площадки задан явно и равен десяти материалам", () => {
    expect(DZEN_FEED_MINIMUM_ITEMS).toBe(10);
  });
});

describe("B620 · пустая лента остаётся валидным документом", () => {
  it("канал без материалов отдаёт корректный RSS, а не ошибку", () => {
    const feed = buildDzenFeed({
      items: [],
      channelUrl: "https://dzen.ru/eterapy",
      now: new Date("2026-07-30T09:00:00Z"),
    });
    expect(feed.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(feed).toContain("</channel>");
    expect(feed).not.toContain("<item>");
  });
});

describe("B620 · вспомогательные преобразования", () => {
  it("абзацы становятся абзацами, перенос строки — <br />", () => {
    expect(dzenBodyHtml("Первый\nс переносом\n\nВторой")).toBe(
      "<p>Первый<br />с переносом</p>\n<p>Второй</p>",
    );
  });

  it("анонс режется по границе слова и не рвёт слово посередине", () => {
    const announce = dzenAnnounce("слово ".repeat(80), 40);
    expect(announce.length).toBeLessThanOrEqual(41);
    expect(announce.endsWith("…")).toBe(true);
    expect(announce).not.toMatch(/сло…$/);
  });

  it("короткий текст остаётся целым", () => {
    expect(dzenAnnounce("Короткий анонс.")).toBe("Короткий анонс.");
  });
});
