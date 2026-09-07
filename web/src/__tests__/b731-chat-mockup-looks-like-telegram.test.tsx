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
import { ChatMockupArt, buildThread, chatMetrics, coverCanvas } from "@/lib/marketing/cover-art";
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
    expect(text).toMatch(/в сети|был\(а\)/); // подпись присутствия в шапке
    expect(text).toContain("Сообщение"); // подсказка поля ввода
  });

  it("собеседник не всегда один и тот же — имя и заливка аватара меняются", () => {
    // Замечание владельца: «Имя собеседника не всегда "Он" […] Но не надо делать
    // всегда одно и то же». Одна подпись во всей ленте читается как шаблон.
    const names = new Set<string>();
    for (let index = 0; index < 24; index += 1) {
      const element = ChatMockupArt({
        ...BASE,
        slotKey: `b610-2w-telegram-2026090${index % 9}-0${index % 7}`,
        messageText: "Ты стала какой-то чужой",
      });
      const header = textOf(element).split(/\d{2}:\d{2}/)[1] ?? "";
      names.add(header.trim().slice(0, 20));
    }
    expect(names.size).toBeGreaterThan(3);
  });

  it("лента набирается так, чтобы не помещаться на экран — это скриншот, а не два пузыря", () => {
    // Замечание владельца: «когда делаешь скриншот экрана, то видно весь экран,
    // а не только урезанную его часть». Пустота между шапкой и парой пузырей —
    // экран, который не может так выглядеть ни у кого.
    for (const platform of ["telegram", "dzen", "instagram", "threads"]) {
      const canvas = coverCanvas(platform);
      const { dp, phoneDp } = chatMetrics(canvas.width, canvas.height);
      const chatDp = canvas.height / dp - (24 + 56 + 48);
      const thread = buildThread({
        seed: `b610-2w-${platform}-20260909-01`,
        quote: "Ты стала какой-то чужой, я не понимаю, что происходит",
        reply: "Не знаю, что на это ответить",
        chatDp,
        maxBubbleDp: Math.round(phoneDp * 0.74),
      });
      expect(thread.length).toBeGreaterThan(2);
      // Реплика из тела поста стоит предпоследней, наш ответ — последним.
      expect(thread[thread.length - 2].side).toBe("in");
      expect(thread[thread.length - 1].side).toBe("out");
      // Время идёт по возрастанию к низу.
      const minutes = thread.map((line) => Number(line.time.slice(0, 2)) * 60 + Number(line.time.slice(3)));
      for (let index = 1; index < minutes.length; index += 1) {
        expect(minutes[index]).toBeGreaterThan(minutes[index - 1]);
      }
      // Трёх подряд с одной стороны не бывает.
      for (let index = 2; index < thread.length; index += 1) {
        const run = thread[index].side === thread[index - 1].side && thread[index - 1].side === thread[index - 2].side;
        expect(run).toBe(false);
      }
    }
  });

  it("длина переписки меняется от материала к материалу", () => {
    const lengths = new Set<number>();
    for (let index = 0; index < 12; index += 1) {
      lengths.add(
        buildThread({
          seed: `b610-2w-telegram-2026090${index % 9}-0${index}`,
          quote: "Ты стала какой-то чужой",
          reply: "Не знаю, что на это ответить",
          chatDp: 200,
          maxBubbleDp: 268,
        }).length,
      );
    }
    expect(lengths.size).toBeGreaterThan(1);
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
