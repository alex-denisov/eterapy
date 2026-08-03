/**
 * B640 — память разговора для ответов на входящее и на комментарии.
 *
 * Владелец 2026-08-03: «ответы на комментарии должны помнить, о чём была
 * публикация, а личная переписка — о чём человек писал раньше, иначе каждое
 * следующее сообщение трактуется как новое».
 *
 * Так и было: `MarketingInboundMessage.threadId` в базе есть с B618, но в
 * промпт ответа не попадал ни он, ни история. Модель каждый раз видела ровно
 * одно сообщение и отвечала как незнакомцу — на третьей реплике это выглядит
 * не как бот, а как невнимательность.
 *
 * Собираем ровно два вида памяти:
 *
 *  1. **Ветка** — что человек писал раньше и что мы ему отвечали. Только
 *     ОПУБЛИКОВАННЫЕ наши ответы: черновик, который не вышел, человек не видел,
 *     и ссылаться на него в разговоре нельзя.
 *  2. **Наша публикация** — текст поста, под которым идёт разговор. Без него
 *     ответ на «а почему так?» строится вслепую.
 *
 * Наружу отдаём компактно и с ролями: длинная стенограмма съедает контекст, а
 * ролей без разметки модель не различает.
 */

import db from "@/lib/db";

/** Сколько реплик ветки показываем. Дальше — не разговор, а архив. */
const THREAD_TURN_LIMIT = 8;
/** Обрезка одной реплики: смысл сохраняется, контекст не выгорает. */
const TURN_CHARS = 600;

export interface ConversationTurn {
  role: "them" | "us";
  at: string;
  text: string;
}

export interface ConversationMemory {
  /** Реплики от старых к новым, включая текущее сообщение последним. */
  thread: ConversationTurn[];
  /** Наш пост, под которым идёт разговор, если он найден. */
  ourPost: { title: string; text: string; publishedAt: string | null } | null;
}

function short(value: string, limit = TURN_CHARS) {
  const text = value.trim();
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

/**
 * @param inboundId текущее входящее (может отсутствовать — тогда ветки нет)
 * @param threadId  наш пост/чат, внутри которого идёт разговор
 * @param platform  площадка: ветки разных площадок не смешиваются
 */
export async function buildConversationMemory(input: {
  inboundId: string | null;
  threadId: string | null;
  platform: string;
}): Promise<ConversationMemory> {
  const memory: ConversationMemory = { thread: [], ourPost: null };
  if (!input.threadId && !input.inboundId) return memory;

  // Ветка — это все входящие того же треда на той же площадке. Когда треда
  // нет (площадка его не отдала), остаётся само сообщение: это честнее, чем
  // склеивать разговоры разных людей по одному лишь имени автора.
  const inbound = input.threadId
    ? await db.marketingInboundMessage.findMany({
      where: { platform: input.platform, threadId: input.threadId },
      orderBy: { receivedAt: "desc" },
      take: THREAD_TURN_LIMIT,
      select: { id: true, text: true, receivedAt: true },
    })
    : input.inboundId
      ? await db.marketingInboundMessage.findMany({
        where: { id: input.inboundId },
        select: { id: true, text: true, receivedAt: true },
      })
      : [];

  const ourReplies = inbound.length > 0
    ? await db.externalPublication.findMany({
      where: {
        inboundReplyToId: { in: inbound.map((row) => row.id) },
        // Только то, что человек действительно видел.
        status: "PUBLISHED",
      },
      select: { body: true, publishedAt: true },
    })
    : [];

  const turns: ConversationTurn[] = [
    ...inbound.map((row) => ({
      role: "them" as const,
      at: row.receivedAt.toISOString(),
      text: short(row.text),
    })),
    ...ourReplies
      .filter((row) => row.body)
      .map((row) => ({
        role: "us" as const,
        at: (row.publishedAt ?? new Date(0)).toISOString(),
        text: short(row.body as string),
      })),
  ].sort((left, right) => left.at.localeCompare(right.at));

  memory.thread = turns.slice(-THREAD_TURN_LIMIT);

  if (input.threadId) {
    // Пост, под которым идёт разговор. Ищем по адресу площадки: `publicUrl`
    // хранит опубликованный адрес, а `engagementTargetId` — идентификатор
    // поста у площадки для наших же комментариев.
    const ourPost = await db.externalPublication.findFirst({
      where: {
        platform: input.platform,
        status: "PUBLISHED",
        OR: [
          { engagementTargetId: input.threadId },
          { publicUrl: { contains: input.threadId } },
        ],
      },
      orderBy: { publishedAt: "desc" },
      select: { title: true, body: true, publishedAt: true },
    });
    if (ourPost?.body) {
      memory.ourPost = {
        title: ourPost.title,
        text: short(ourPost.body, 1_200),
        publishedAt: ourPost.publishedAt?.toISOString() ?? null,
      };
    }
  }

  return memory;
}
