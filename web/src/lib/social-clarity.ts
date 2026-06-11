import type { Dialogue, DialogueMessage } from "@prisma/client";

type DialogueWithMessages = Dialogue & {
  messages: Pick<DialogueMessage, "role" | "content" | "createdAt">[];
};

export function inviteExpiryDate(days = 7) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);
  return expiresAt;
}

export function dialogueToPrivateText(dialogue: DialogueWithMessages | null | undefined) {
  if (!dialogue) return "";
  const messages = dialogue.messages
    .filter((message) => message.role === "USER")
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((message) => message.content.trim())
    .filter(Boolean);

  return messages.join("\n\n").slice(0, 6000);
}

export function buildPairTeaser(input: {
  creatorText: string;
  partnerText: string;
  relationType: string;
}) {
  const creatorLength = input.creatorText.trim().length;
  const partnerLength = input.partnerText.trim().length;
  const balance = Math.abs(creatorLength - partnerLength) < 280
    ? "Обе стороны дали сопоставимый по объему контекст."
    : "Один ответ заметно подробнее другого, поэтому итог стоит читать как приглашение к уточнению, а не как вердикт.";
  const creatorWords = meaningfulWords(input.creatorText);
  const partnerWords = meaningfulWords(input.partnerText);
  const shared = creatorWords.find((word) => partnerWords.includes(word)) ?? "спокойствие";

  return [
    "Бесплатный фрагмент совместимости",
    `Совпадение: в обоих ответах звучит тема «${shared}».`,
    `Различие: ${balance}`,
    "Теплый вопрос: что каждый из вас готов сделать, чтобы разговор стал безопаснее на один маленький шаг?",
    `Тип связи: ${relationLabel(input.relationType)}.`,
  ].join("\n");
}

export function buildCircleTeaser(input: {
  question: string;
  participantCount: number;
  answers: string[];
}) {
  const shortQuestion = input.question.trim().replace(/\s+/g, " ").slice(0, 140);
  const answerWords = input.answers
    .join(" ")
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 4);
  const recurring = [...new Set(answerWords)]
    .filter((word) => answerWords.filter((item) => item === word).length > 1)
    .slice(0, 3);

  return [
    `Круг собрал ${input.participantCount} ${participantWord(input.participantCount)} вокруг вопроса: «${shortQuestion}».`,
    recurring.length
      ? `Тема: чаще всего повторяется ${recurring.join(", ")}.`
      : "Ответы различаются, поэтому итог стоит использовать как карту взглядов, а не голосование.",
    "Слепая зона: участники могут говорить о разном уровне риска, даже если используют похожие слова.",
    "Следующий шаг: выберите одну тему пересечения и обсудите её коротко, без требования немедленного решения.",
  ].join("\n");
}

export function buildCircleReport(input: {
  question: string;
  answers: { name: string; text: string }[];
}) {
  const participants = input.answers
    .map((answer, index) => `${index + 1}. ${answer.name}: ${answer.text.trim()}`)
    .join("\n");

  return [
    "Круг",
    "",
    `Общий вопрос: ${input.question.trim()}`,
    "",
    "Что уже видно",
    buildCircleTeaser({
      question: input.question,
      participantCount: input.answers.length,
      answers: input.answers.map((answer) => answer.text),
    }),
    "",
    "Границы результата",
    "Итог не раскрывает приватные ответы как инструмент давления. Его задача — показать несколько взглядов и помочь начать разговор без обвинений.",
    "",
    "Ответы участников",
    participants,
    "",
    "Бережный следующий шаг",
    "Выберите одну тему, где есть пересечение, и договоритесь о коротком разговоре: что каждый понял, что готов сделать и где нужна пауза.",
  ].join("\n");
}

function relationLabel(type: string) {
  const labels: Record<string, string> = {
    romantic: "отношения",
    friendship: "дружба",
    business: "работа или проект",
    family: "семья",
  };
  return labels[type] ?? "общий вопрос";
}

function participantWord(count: number) {
  if (count === 1) return "ответ";
  if (count > 1 && count < 5) return "ответа";
  return "ответов";
}

function meaningfulWords(text: string) {
  const stopWords = new Set(["хочу", "больше", "меньше", "постоянных", "кажется", "важно", "очень"]);
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 5 && !stopWords.has(word));
}
