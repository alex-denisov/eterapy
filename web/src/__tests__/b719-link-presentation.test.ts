/**
 * B719 — сырой UTM-хвост в опубликованном материале.
 *
 * Жалоба владельца 2026-08-23: «Сырой UTM-хвост — доработай, сделай эффективно,
 * при этом учти что полную ссылку в постах вообще не нужно публиковать, ее
 * можно скрывать под URL».
 *
 * Образец взят из реестра прода дословно — это то, что стояло в хвосте живых
 * материалов Telegram, Дзена и Reddit.
 */

import {
  compactMarketingUrl,
  compactOwnLinkInBody,
  linkLabelFromBody,
  renderMarketingLink,
  toPlatformMarkup,
} from "@/lib/marketing/link-presentation";
import { platformPlaybook } from "@/lib/marketing/platform-playbook";

const LIVE = "https://eterapy.com/library/9-arkan-otshelnik-v-matritse-sudby"
  + "?utm_source=telegram&utm_medium=social&utm_campaign=library"
  + "&utm_content=9-arkan-otshelnik-v-matritse-sudby";

describe("B719 — метка, дублирующая путь, из адреса уходит", () => {
  it("utm_content равен слагу и потому лишний", () => {
    const compact = compactMarketingUrl(LIVE);
    expect(compact).not.toContain("utm_content");
    expect(LIVE.length - compact.length).toBeGreaterThan(45);
  });

  it("три измерения отчёта Метрики остаются на месте", () => {
    const compact = compactMarketingUrl(LIVE);
    expect(compact).toContain("utm_source=telegram");
    expect(compact).toContain("utm_medium=social");
    expect(compact).toContain("utm_campaign=library");
  });

  it("чужой utm_content не трогаем: он мог нести смысл", () => {
    const foreign = "https://eterapy.com/library/abc?utm_source=vk&utm_content=banner-2";
    expect(compactMarketingUrl(foreign)).toContain("utm_content=banner-2");
  });

  it("не ломается на строке, которая вообще не адрес", () => {
    expect(compactMarketingUrl("не ссылка")).toBe("не ссылка");
  });
});

describe("B719 — адрес прячется под текст там, где площадка это умеет", () => {
  const body = "Текст поста.\n\nРазбор целиком: " + LIVE;

  it("Telegram получает HTML-ссылку, а не голый адрес", () => {
    const out = toPlatformMarkup({
      markup: platformPlaybook("telegram").contract.inlineLinkMarkup,
      body, url: LIVE, label: linkLabelFromBody(body, LIVE),
    });
    expect(out?.parseMode).toBe("HTML");
    expect(out?.text).toContain('<a href="https://eterapy.com/library/');
    expect(out?.text).toContain(">Разбор целиком</a>");
    // Видимого адреса в тексте не осталось вовсе.
    expect(out!.text.replace(/<a href="[^"]*">/u, "")).not.toContain("utm_source");
  });

  it("Reddit получает markdown", () => {
    const out = toPlatformMarkup({
      markup: platformPlaybook("reddit").contract.inlineLinkMarkup,
      body, url: LIVE, label: "Разбор целиком",
    });
    expect(out?.parseMode).toBe("Markdown");
    expect(out?.text).toContain("[Разбор целиком](https://eterapy.com/library/");
  });

  it("ВКонтакте разметки не получает: гиперссылок в теле у неё нет", () => {
    expect(platformPlaybook("vk").contract.inlineLinkMarkup).toBeNull();
    expect(toPlatformMarkup({
      markup: null, body, url: LIVE, label: "Разбор целиком",
    })).toBeNull();
  });

  it("Дзен разметки не получает: браузерный редактор напечатал бы её читателю", () => {
    expect(platformPlaybook("dzen").contract.inlineLinkMarkup).toBeNull();
  });

  it("но без разметки адрес всё равно укорачивается", () => {
    const out = compactOwnLinkInBody(body, LIVE);
    expect(out).not.toContain("utm_content");
    expect(out).toContain("utm_source=telegram");
    expect(out.length).toBeLessThan(body.length);
  });
});

describe("B719 — разметка не портит текст", () => {
  it("угловые скобки в теле экранируются, а наша ссылка — нет", () => {
    const body = "Модель сказала <think> и это видно.\n\nРазбор целиком: " + LIVE;
    const out = toPlatformMarkup({
      markup: "html", body, url: LIVE, label: "Разбор целиком",
    });
    expect(out?.text).toContain("&lt;think&gt;");
    expect(out?.text).toContain('<a href="');
    expect(out?.text).not.toContain("&lt;a href");
  });

  it("амперсанд внутри адреса экранируется — иначе Telegram отвергнет разметку", () => {
    const out = toPlatformMarkup({
      markup: "html", body: "текст " + LIVE, url: LIVE, label: "Разбор",
    });
    expect(out?.text).toContain("&amp;utm_medium=social");
  });

  it("подпись со скобками не ломает markdown — отдаём адрес как есть", () => {
    expect(renderMarketingLink({
      markup: "markdown", url: LIVE, label: "Разбор (целиком)",
    })).toBe(compactMarketingUrl(LIVE));
  });

  it("подпись берётся из слов автора, а не подменяется нашими", () => {
    const body = "Пост.\n\nЧто это значит для вас: " + LIVE;
    expect(linkLabelFromBody(body, LIVE)).toBe("Что это значит для вас");
  });

  it("адреса в теле нет — переводить нечего, и это говорится прямо", () => {
    expect(toPlatformMarkup({
      markup: "html", body: "пост без ссылки", url: LIVE, label: "Разбор",
    })).toBeNull();
  });
});
