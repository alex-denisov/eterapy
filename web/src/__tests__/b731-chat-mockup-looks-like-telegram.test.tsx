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
import {
  buildThread,
  chatTopicFor,
  contactFor,
  segmentEmoji,
  type ThreadLine,
} from "@/lib/marketing/chat-thread";
import { ogEmoji } from "@/lib/marketing/cover-emoji";
import { framingFor } from "@/lib/marketing/cover-art";
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
        topic: "relationships",
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
      const minutes = thread.map((line: ThreadLine) => Number(line.time.slice(0, 2)) * 60 + Number(line.time.slice(3)));
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
          topic: "general",
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

  it("тема переписки берётся из материала, а собеседник — из темы", () => {
    // Проверка на стенде: вокруг реплики «Почему застрял проект?» стояли
    // «мне тоже тяжело» и «Я не хочу так больше» — переписка про отношения
    // поверх делового вопроса.
    expect(chatTopicFor({ title: "Почему застрял проект и что с этим делать" })).toBe("work");
    expect(chatTopicFor({ title: "Подросток не разговаривает: что делать родителю" })).toBe("parenting");
    expect(chatTopicFor({ title: "Он изменил: что дальше" })).toBe("cheating");
    expect(chatTopicFor({ title: "Как пережить расставание с парнем" })).toBe("relationships");
    expect(chatTopicFor({ title: "Аркан Жрица в раскладе" })).toBe("general");

    // Под рабочим материалом в шапке не может стоять «Любимый».
    for (let index = 0; index < 30; index += 1) {
      const contact = contactFor(`b610-2w-telegram-2026090${index % 9}-0${index % 7}`, "work");
      expect(contact.name).not.toMatch(/Любим|Бывш|Свекров/);
    }
  });

  it("реплики темы разные у разных тем — фон не тащит чужой сюжет", () => {
    const forTopic = (topic: "work" | "relationships") =>
      buildThread({
        seed: "b610-2w-telegram-20260909-01",
        topic,
        quote: "Почему застрял проект?",
        reply: "принял",
        chatDp: 200,
        maxBubbleDp: 268,
      })
        .map((line) => line.text)
        .join(" | ");
    expect(forTopic("work")).not.toBe(forTopic("relationships"));
  });

  it("эмодзи подставляются картинкой, служебные символы выбрасываются", async () => {
    const map = await ogEmoji();
    expect(Object.keys(map).length).toBeGreaterThanOrEqual(40);
    for (const source of Object.values(map)) {
      expect(source.startsWith("data:image/svg+xml;base64,")).toBe(true);
    }

    // «❤️» — это ДВА символа: сердце и селектор начертания U+FE0F. Селектор без
    // глифа печатался бы пустым прямоугольником рядом с эмодзи.
    const parts = segmentEmoji("да ладно))) \u2764\uFE0F", map);
    expect(parts.filter((part) => part.kind === "emoji")).toHaveLength(1);
    expect(parts.map((part) => part.value).join("")).not.toContain("\uFE0F");

    // Без карты эмодзи выбрасывается, а не рисуется квадратом.
    expect(segmentEmoji("ок \u{1F600}", undefined).filter((part) => part.kind === "emoji")).toHaveLength(0);
  });

  it("кадр бывает и полным, и обрезанным сверху — как решает автор скриншота", () => {
    const framings = new Set<string>();
    for (let index = 0; index < 30; index += 1) {
      framings.add(framingFor(`b610-2w-telegram-2026090${index % 9}-0${index % 7}`));
    }
    expect(framings).toEqual(new Set(["full", "cropped"]));

    // Обрезанный кадр не показывает шапку: ни имени, ни подписи присутствия.
    const cropped = textOf(
      ChatMockupArt({ ...BASE, framing: "cropped", messageText: "Ты стала какой-то чужой" }),
    );
    expect(cropped).not.toMatch(/в сети|был\(а\)/);
    // Поле ввода остаётся: снизу его обрезать нельзя, оно на экране всегда.
    expect(cropped).toContain("Сообщение");
  });
});
