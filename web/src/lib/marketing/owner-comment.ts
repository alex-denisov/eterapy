/**
 * B761 — «комментарий <ссылка>»: текст комментария под ЧУЖИМ постом.
 *
 * Агент пишет, второй проход проверяет, владелец премодерирует в канале и
 * публикует РУКАМИ (дороги наружу у такого материала нет: см.
 * `OWNER_COMMENT_CONTENT_TYPE`). Суточного лимита нет — владелец сам решает,
 * сколько комментариев ему нужно.
 */

import { createHash } from "node:crypto";

import db from "@/lib/db";
import { aiComplete } from "@/lib/ai";
import { log, serializeError } from "@/lib/logger";
import { ANYA_PERSONA_BLOCK } from "@/lib/marketing/agent-prompt";
import { ingestOwnerTopic } from "@/lib/marketing/discovery";
import { MARKETING_ORCHESTRATOR_REPORT_FEATURE } from "@/lib/marketing/model-pool";
import { requestMarketingModeration } from "@/lib/marketing/moderation";
import { OWNER_COMMENT_CONTENT_TYPE } from "@/lib/marketing/perimeter";

export const OWNER_COMMENT_SOURCE = "OWNER_COMMENT";
export const COMMENT_MAX = 280;

export interface CommentDraft {
  text: string;
  cluster: string | null;
  technique: string | null;
}

export interface CommentFeedback {
  mode: "rewrite" | "patch";
  instructions: string;
  previousText: string;
}

/** Чистая проверка черновика: один текст ≤ 280 знаков без ссылок. */
export function parseCommentDraft(raw: string): CommentDraft | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const data = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    const text = typeof data.comment === "string" ? data.comment.trim() : "";
    if (!text || text.length > COMMENT_MAX || /https?:\/\//i.test(text)) return null;
    const tag = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim().slice(0, 80) : null);
    return { text, cluster: tag(data.cluster), technique: tag(data.technique) };
  } catch {
    return null;
  }
}

const RULES = [
  "Комментарий: по-русски, до 280 знаков, без ссылок, без продажи и призывов зайти к нам, без обещаний результата,",
  "без здоровья, диагнозов, смерти и сумм. Живой человек добавляет в разговор своё наблюдение, шутку или аккуратный вопрос.",
  "Не спорь, не поучай, не выдавай вымысел за историю клиента, не называй себя психологом, психотерапевтом или врачом, не заявляй дипломы и лицензии. Личный опыт и истории в комментариях не выдумывай.",
].join("\n");

function writerPrompt(): string {
  return [
    "Ты автор бренда ETerapy в Threads. Тебе дали чужой пост (текст и/или пожелание владельца). Напиши ОДИН комментарий под ним.",
    ANYA_PERSONA_BLOCK,
    RULES,
    "Верни ТОЛЬКО JSON: {\"comment\":\"…\",\"cluster\":\"тема/кластер в 2-4 словах\",\"technique\":\"приём в 2-3 словах\"}.",
  ].join("\n\n");
}

async function complete(system: string, user: string, temperature: number): Promise<string> {
  const response = await aiComplete({
    feature: MARKETING_ORCHESTRATOR_REPORT_FEATURE,
    dataClass: "PUBLIC_MARKETING",
    maxTokens: 500,
    temperature,
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
  });
  return response.text;
}

/** Независимый проход: тот же текст или минимально исправленный. Сбой редактора черновик не убивает. */
async function editorPass(draft: CommentDraft): Promise<CommentDraft> {
  try {
    const raw = await complete(
      `Ты независимый редактор. Проверь комментарий по правилам и верни ТОЛЬКО JSON {"comment":"…"} — тот же текст, если он годится, или минимально исправленный.\n${RULES}`,
      draft.text,
      0.2,
    );
    const fixed = parseCommentDraft(raw);
    return fixed ? { ...draft, text: fixed.text } : draft;
  } catch (error) {
    log.warn("owner_comment.editor_failed", { error: serializeError(error) });
    return draft;
  }
}

function feedbackBlock(feedback: CommentFeedback | undefined): string {
  if (!feedback) return "";
  return feedback.mode === "patch"
    ? `\n\nТекущий комментарий:\n${feedback.previousText}\n\nПравки владельца (измени ТОЛЬКО названное, остальное оставь):\n${feedback.instructions}`
    : `\n\nПрежний вариант отклонён:\n${feedback.previousText}\n\nУчти замечание владельца и напиши заново по-другому:\n${feedback.instructions}`;
}

/** Автор + независимый редактор. `null` — модель не дала годного текста. */
export async function draftOwnerComment(input: {
  sample: string;
  feedback?: CommentFeedback;
}): Promise<CommentDraft | null> {
  try {
    const raw = await complete(writerPrompt(), `Задание и пост:\n${input.sample}${feedbackBlock(input.feedback)}`, 0.7);
    const draft = parseCommentDraft(raw);
    return draft ? await editorPass(draft) : null;
  } catch (error) {
    log.warn("owner_comment.writer_failed", { error: serializeError(error) });
    return null;
  }
}

/** Заводит материал и отправляет карточку премодерации. Возвращает ответ владельцу. */
export async function queueOwnerComment(input: { url: string | null; text: string; now: Date }): Promise<string> {
  const sample = input.text.replace(/\[приложено фото\]/g, "").trim();
  const draft = await draftOwnerComment({ sample });
  if (!draft) {
    return "Не смог собрать комментарий: пришлите ещё и текст поста (без него модель гадает) или повторите чуть позже.";
  }
  const key = `owner-comment-${createHash("sha256").update(input.url ?? sample).digest("hex").slice(0, 12)}-${input.now.getTime().toString(36)}`;
  const row = await db.externalPublication.create({
    data: {
      key,
      platform: "threads",
      title: `Комментарий владельца: ${sample.slice(0, 60)}`,
      contentType: OWNER_COMMENT_CONTENT_TYPE,
      status: "REVIEW",
      source: OWNER_COMMENT_SOURCE,
      cluster: draft.cluster,
      body: draft.text,
      engagementTargetUrl: input.url,
      engagementExcerpt: sample.slice(0, 1500),
      notes: JSON.stringify({ technique: draft.technique, rounds: 0 }),
      autoPublish: false,
      // Редактор прошёл: очередь агента такую строку не подбирает.
      agentReviewedAt: input.now,
    },
  });
  // Побочное: тема чужого поста — в очередь наших тем. Отказ не отменяет комментарий.
  const topicText = sample.replace(input.url ?? "", "").trim();
  if (input.url && topicText.length >= 40) {
    await ingestOwnerTopic({
      platform: "threads",
      targetId: input.url.split(/\/(?:post|share)\//)[1] ?? input.url,
      targetUrl: input.url,
      targetLabel: "Threads (вручную)",
      excerpt: topicText.slice(0, 500),
      topic: topicText.slice(0, 80),
    }, input.now).catch((error: unknown) => {
      log.warn("owner_comment.topic_failed", { error: serializeError(error) });
      return false;
    });
  }
  await requestMarketingModeration(row.id);
  return "Комментарий собран, карточка с кнопками ушла в канал.";
}
