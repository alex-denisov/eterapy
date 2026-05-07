import crypto from "node:crypto";
import db from "@/lib/db";

const CARDS = [
  {
    title: "Маленький честный шаг",
    body: "Сегодня достаточно выбрать один вопрос, который правда просит внимания.",
    prompt: "Что станет чуть легче, если я признаю это вслух?",
  },
  {
    title: "Граница без резкости",
    body: "Можно оставаться теплой и при этом не соглашаться на то, что истощает.",
    prompt: "Где сегодня мне нужна мягкая, но ясная граница?",
  },
  {
    title: "Пауза перед ответом",
    body: "Не каждый импульс требует немедленного действия. Иногда ясность приходит после паузы.",
    prompt: "Что изменится, если я отвечу не сразу?",
  },
  {
    title: "Вернуться к себе",
    body: "Внешние советы полезны только тогда, когда не заглушают внутренний голос.",
    prompt: "Какой мой собственный критерий в этой ситуации?",
  },
  {
    title: "Бережная проверка реальности",
    body: "Отделите факты от догадок. Так тревоге становится меньше места.",
    prompt: "Что я точно знаю, а что пока только предполагаю?",
  },
  {
    title: "Один ресурс",
    body: "Сегодня не нужно чинить всю жизнь. Найдите один источник опоры.",
    prompt: "Что даст мне плюс пять процентов спокойствия?",
  },
  {
    title: "Право на ясность",
    body: "Ваш вопрос достаточно важен уже потому, что он возвращается.",
    prompt: "Какой ответ я боюсь услышать, но готова рассмотреть?",
  },
];

export function dailyCardDate(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function cardIndex(userId: string, cardDate: Date) {
  const digest = crypto.createHash("sha256").update(`${userId}:${cardDate.toISOString()}`).digest();
  return digest[0] % CARDS.length;
}

export async function getOrCreateDailyCard(userId: string, now = new Date()) {
  const cardDate = dailyCardDate(now);
  const existing = await db.dailyCard.findUnique({
    where: { userId_cardDate: { userId, cardDate } },
  });
  if (existing) return { card: existing, created: false };

  const template = CARDS[cardIndex(userId, cardDate)];
  const card = await db.dailyCard.create({
    data: {
      userId,
      cardDate,
      title: template.title,
      body: template.body,
      prompt: template.prompt,
      metadata: {
        source: "deterministic_v1",
        templateIndex: cardIndex(userId, cardDate),
      },
    },
  });
  return { card, created: true };
}
