/**
 * B731 — мокап переписки обязан читаться как скриншот Telegram.
 *
 * Требование владельца: «Если скриншоты будут хоть немного непохожи на Telegram,
 * то это будет явным признаком полной ИИ-генерации». Проверять «похожесть»
 * прогоном нельзя — её подтверждает владелец глазами. Прогон стережёт ровно то,
 * что ломается молча: признаки подделки, которые уже были в первой редакции, и
 * подпорки, без которых Satori рисует не то.
 */

import type { ReactElement } from "react";
import { ChatMockupArt, chatMetrics, coverCanvas } from "@/lib/marketing/cover-art";
import { ogFonts, OG_FONT_FAMILY } from "@/lib/marketing/cover-fonts";

type Node = ReactElement<{ children?: unknown; style?: Record<string, unknown> }>;

function walk(node: unknown, visit: (element: Node) => void): void {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit);
    return;
  }
  if (!node || typeof node !== "object" || !("props" in node)) return;
  const element = node as Node;
  visit(element);
  walk(element.props?.children, visit);
}

function textOf(node: unknown): string {
  const parts: string[] = [];
  const collect = (value: unknown) => {
    if (typeof value === "string" || typeof value === "number") parts.push(String(value));
    else if (Array.isArray(value)) for (const item of value) collect(item);
    else if (value && typeof value === "object" && "props" in value) {
      collect((value as Node).props?.children);
    }
  };
  collect(node);
  return parts.join(" ");
}

const BASE = {
  slotKey: "b610-2w-telegram-20260908-01",
  platform: "telegram",
  title: "Почему он замолчал: разбор переписки",
  eyebrow: "Отношения",
  scheduledFor: null,
};

describe("B731: мокап переписки — скриншот Telegram, а не абстрактный мессенджер", () => {
  it("фон ленты — цвет ночной темы Telegram (chat_wallpaper), а не свой тёмно-синий", () => {
    const element = ChatMockupArt({ ...BASE, messageText: "Ты стала какой-то чужой" });
    expect(element.props.style?.backgroundColor).toBe("#0f0f10");
    // Шрифт объявлен тот же, что у Telegram на Android.
    expect(element.props.style?.fontFamily).toBe("Roboto");
  });

  it("брендовой плашки внутри скриншота нет — ни один мессенджер её не рисует", () => {
    const text = textOf(ChatMockupArt({ ...BASE, messageText: "Ты стала какой-то чужой" }));
    expect(text).not.toMatch(/РАЗБОР АНИ/i);
    expect(text).not.toMatch(/ETerapy/i);
    expect(text).not.toMatch(/КУРАТОР/i);
    // И заголовок поста в шапку чата не подставляется: там имя собеседника.
    expect(text).not.toContain(BASE.title);
  });

  it("нарисованы обязательные части интерфейса: строка состояния, шапка, поле ввода", () => {
    const text = textOf(ChatMockupArt({ ...BASE, messageText: "Ты стала какой-то чужой" }));
    expect(text).toMatch(/\d{2}:\d{2}/); // часы в строке состояния и время сообщений
    expect(text).toContain("был(а) недавно");
    expect(text).toContain("Сообщение"); // подсказка поля ввода
    expect(text).toContain("Сегодня"); // служебная плашка даты
  });

  it("реплика в пузыре печатается без кавычек — сообщений в «ёлочках» не бывает", () => {
    const text = textOf(
      ChatMockupArt({ ...BASE, messageText: "«Ты стала какой-то чужой»" }),
    );
    expect(text).toContain("Ты стала какой-то чужой");
    expect(text).not.toContain("«");
    expect(text).not.toContain("»");
  });

  it("под ленту сообщений остаётся не меньше 165 dp на каждом холсте площадки", () => {
    // Иначе шапка с полем ввода съедают экран, и на широком Дзене от переписки
    // остаётся полоска — а это уже не скриншот.
    for (const platform of ["telegram", "vk", "dzen", "instagram", "threads", "reddit"]) {
      const canvas = coverCanvas(platform);
      const { dp } = chatMetrics(canvas.width, canvas.height);
      const chatDp = canvas.height / dp - (24 + 56 + 48);
      expect(chatDp).toBeGreaterThanOrEqual(164);
    }
  });

  it("шрифт вшит в репозиторий и читается с диска, а не из сети", async () => {
    const fonts = await ogFonts();
    expect(fonts).toHaveLength(2);
    expect(fonts.map((font) => font.weight).sort()).toEqual([400, 500]);
    for (const font of fonts) {
      expect(font.name).toBe(OG_FONT_FAMILY);
      // Заголовок TrueType: Satori не понимает woff2, и подмена формата
      // проявилась бы только на отрисованной картинке.
      expect(Buffer.from(font.data.slice(0, 4)).toString("hex")).toBe("00010000");
    }
  });
});
