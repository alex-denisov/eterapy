/**
 * B601 · граница вреда — шкала вместо выключателя.
 *
 * Решение владельца 2026-07-27:
 *
 * > «оставляем только запрет на явные угрозы причинить себе/другим вред (и то,
 * > только если они становятся явными с подтверждениями слов, а не упоминаются
 * > вскользь …), просто сделай не 0/1 шкалу, а 100 баллов как у антифрода».
 *
 * До этого одно слово из списка («убить», «суицид», «насилие») переводило
 * разговор в кризис целиком. «Он меня убивает своим молчанием» и «я не хочу
 * жить» получали одинаковый ответ платформы — и первому человеку разговор
 * обрывали на ровном месте.
 *
 * Тесты держат обе стороны границы: вскользь — не кризис; явное и
 * подтверждённое — кризис, всегда.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  HARM_CRISIS_THRESHOLD,
  HARM_ELEVATED_THRESHOLD,
  scoreHarmRisk,
  heuristicDialogueSafety,
} from "@/lib/dialogue-safety";

describe("scoreHarmRisk — упоминание вскользь не равно угрозе", () => {
  const passing = [
    "он меня убивает своим молчанием",
    "эта работа меня убивает, я выгорел",
    "мы поссорились, и я сказала что убью его если он опять опоздает — шутка конечно",
    "смотрели фильм про насилие, и я задумалась о своих отношениях",
    "я готова умереть со смеху от его отговорок",
  ];

  it.each(passing)("не поднимает до кризиса: %s", (text) => {
    expect(scoreHarmRisk(text).score).toBeLessThan(HARM_CRISIS_THRESHOLD);
  });

  const crisis = [
    "я не хочу жить",
    "я решил покончить с собой сегодня вечером",
    "я хочу себя убить и уже всё приготовил",
    "я собираюсь убить его, у меня есть нож",
    "не могу больше, хочу умереть",
  ];

  it.each(crisis)("поднимает до кризиса: %s", (text) => {
    expect(scoreHarmRisk(text).score).toBeGreaterThanOrEqual(HARM_CRISIS_THRESHOLD);
  });

  it("порог кризиса выше порога внимания, а сама шкала — 0..100", () => {
    expect(HARM_ELEVATED_THRESHOLD).toBeLessThan(HARM_CRISIS_THRESHOLD);
    expect(scoreHarmRisk("").score).toBe(0);
    expect(scoreHarmRisk("я хочу себя убить и уже всё приготовил, прощайте").score).toBeLessThanOrEqual(100);
  });

  it("сигналы называются — иначе разбор инцидента невозможен", () => {
    const result = scoreHarmRisk("я решил покончить с собой");
    expect(result.signals.length).toBeGreaterThan(0);
    expect(result.signals[0]).toHaveProperty("flag");
    expect(result.signals[0]).toHaveProperty("score");
  });
});

describe("heuristicDialogueSafety — снятые ограничения", () => {
  it("вопрос про гадание и судьбу больше не помечается", () => {
    for (const text of [
      "что меня ждёт в следующем году",
      "погадай мне на отношения",
      "вернётся ли он ко мне",
      "какая у меня судьба",
    ]) {
      expect(heuristicDialogueSafety(text).level).toBe("normal");
    }
  });

  it("бытовой вопрос про деньги, суд или врача — обычный разговор", () => {
    // Раньше любое «кредит», «суд», «диагноз» давало `sensitive`, а `sensitive`
    // глушит рекомендации и показывает «если сейчас непросто» здоровому человеку.
    for (const text of [
      "стоит ли брать кредит на ремонт",
      "мы разводимся, будет суд по опеке",
      "врач поставил диагноз, я растеряна",
    ]) {
      expect(heuristicDialogueSafety(text).level).toBe("normal");
    }
  });

  it("явная подтверждённая угроза себе — по-прежнему кризис", () => {
    expect(heuristicDialogueSafety("я хочу себя убить, уже всё решил").level).toBe("crisis");
  });

  it("явная подтверждённая угроза другому — по-прежнему кризис", () => {
    expect(heuristicDialogueSafety("я собираюсь убить его, у меня есть нож").level).toBe("crisis");
  });
});

describe("B601 · снятая уклончивость в промтах и копирайте", () => {
  const readSrc = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

  it("общий гардрейл различает «просят сделать» и «спрашивают»", () => {
    // Решение владельца: «если спрашивают, а не просят, то тогда даем ответ
    // прямой и четкий, но сама платформа не может вернуть, воскресить и тд,
    // но карты/расклады могут отвечать прямо».
    const prompts = readSrc("src/lib/ai-gateway/prompts.ts");
    expect(prompts).toContain("Если человек ПРОСИТ это сделать");
    expect(prompts).toContain("Если человек СПРАШИВАЕТ");
    // Запрет ОБЕЩАТЬ остаётся.
    expect(prompts).toContain("не берись вернуть партнёра");
    // Запрет ОТВЕЧАТЬ снят.
    expect(prompts).not.toContain("не обещай исцеления, возврата партнера, предсказаний");
  });

  it("бесплатный диалог больше не отговаривает от гадания", () => {
    const clarifier = readSrc("src/lib/dialogue-clarifier-prompt.ts");
    expect(clarifier).toContain("Не отговаривай от гадания");
    expect(clarifier).not.toContain("Прямых предсказаний не давай");
    expect(clarifier).not.toContain("не предлагай гадание");
  });

  it("на требование прямого ответа диалог отвечает, а не объясняет отказ", () => {
    const clarifier = readSrc("src/lib/dialogue-clarifier-prompt.ts");
    expect(clarifier).not.toContain("определённости у меня нет");
    expect(clarifier).toContain("дай его");
  });

  it("услуги-аналитики больше не запрещают отвечать про будущее", () => {
    for (const file of [
      "src/lib/reframe-prompt.ts",
      "src/lib/deep-report-prompt.ts",
      "src/lib/chat-analysis-prompt.ts",
    ]) {
      expect(readSrc(file)).not.toContain("не предсказывай будущее");
      expect(readSrc(file)).not.toContain("не предсказание будущего");
    }
  });

  it("«это не гадание» ушло из копирайта, «развлекательный характер» остался", () => {
    expect(readSrc("src/lib/product-page-redesign.ts")).not.toContain("не предсказывают судьбу");
    expect(readSrc("src/lib/help-faq-data.ts")).not.toContain("Вы предсказываете будущее?");
    // B648: корпус переехал из компонента в данные `lib/service-guides.ts`.
    expect(readSrc("src/lib/service-guides.ts")).not.toContain("без буквального предсказания");
    // Дисклеймер оферты владелец просил сохранить.
    expect(readSrc("src/content/legal-pack.md")).toContain("развлекательный характер");
    expect(readSrc("src/components/landing/faq.tsx")).toContain("развлекательный характер");
  });

  it("символический контракт прямого ответа не ослаблен", () => {
    // Кризисная маршрутизация и отказ ставить диагноз — не «защита от гаданий»,
    // и владелец их не снимал.
    const prompts = readSrc("src/lib/ai-gateway/prompts.ts");
    expect(prompts).toContain("Ответ разбора: да");
    expect(prompts).toContain("нельзя ставить диагноз");
    expect(prompts).toContain("всегда прерывают эзотерический формат");
  });
});
