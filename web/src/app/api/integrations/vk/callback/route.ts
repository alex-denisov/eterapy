/**
 * B618 · VK Callback API сообщества.
 *
 * VK не подписывает запрос HMAC: подлинность подтверждается полем `secret`,
 * которое мы задаём в настройках сообщества. Поэтому проверка строгая и
 * fail-closed — без сохранённого секрета маршрут не принимает ничего, а не
 * «принимает всё, пока не настроено».
 *
 * Первое обращение VK — тип `confirmation`: в ответ нужна ровно та строка,
 * которую площадка показывает в настройках сервера. Она хранится рядом с
 * секретом, поэтому подключение делается без выкатки.
 */

import { timingSafeEqual } from "node:crypto";
import { log, serializeError } from "@/lib/logger";
import { ingestInboundMessage } from "@/lib/marketing/inbound";
import { marketingPlatformValue } from "@/lib/marketing/platform-settings";

type VkCallbackBody = {
  type?: string;
  secret?: string;
  group_id?: number;
  object?: {
    // wall_reply_new
    id?: number;
    from_id?: number;
    owner_id?: number;
    post_id?: number;
    post_owner_id?: number;
    text?: string;
    reply_to_user?: number;
    // message_new (VK 5.199 присылает объект в message)
    message?: {
      id?: number;
      peer_id?: number;
      from_id?: number;
      text?: string;
      conversation_message_id?: number;
    };
  };
};

function equal(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  let body: VkCallbackBody;
  try {
    body = JSON.parse(rawBody) as VkCallbackBody;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const expectedSecret = await marketingPlatformValue("VK_CALLBACK_SECRET");
  if (!expectedSecret || !body.secret || !equal(body.secret, expectedSecret)) {
    log.warn("marketing.vk_callback_rejected", { type: body.type ?? "unknown" });
    return new Response("Forbidden", { status: 403 });
  }

  if (body.type === "confirmation") {
    const confirmation = await marketingPlatformValue("VK_CALLBACK_CONFIRMATION");
    if (!confirmation) return new Response("Not configured", { status: 503 });
    return new Response(confirmation, { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  try {
    const object = body.object ?? {};
    if (body.type === "wall_reply_new" && object.id && (object.text ?? "").trim()) {
      const ownerId = object.post_owner_id ?? object.owner_id;
      await ingestInboundMessage({
        platform: "vk",
        kind: "COMMENT",
        externalId: String(object.id),
        threadId: ownerId && object.post_id ? `${ownerId}_${object.post_id}` : null,
        authorLabel: object.from_id ? `VK id${object.from_id}` : null,
        text: object.text ?? "",
        permalink: ownerId && object.post_id
          ? `https://vk.com/wall${ownerId}_${object.post_id}?reply=${object.id}`
          : null,
      });
    } else if (body.type === "message_new") {
      const message = object.message ?? object;
      const messageId = message.id ?? object.id;
      const peerId = ("peer_id" in message ? message.peer_id : undefined) ?? object.from_id;
      if (messageId && (message.text ?? "").trim()) {
        await ingestInboundMessage({
          platform: "vk",
          kind: "DIRECT",
          externalId: String(messageId),
          threadId: peerId ? String(peerId) : null,
          authorLabel: message.from_id ? `VK id${message.from_id}` : null,
          text: message.text ?? "",
          permalink: body.group_id ? `https://vk.com/gim${body.group_id}` : null,
        });
      }
    }
  } catch (error) {
    // VK повторяет доставку при любом ответе, кроме «ok», и отключает сервер
    // после серии неудач. Разбор сломался — это наш дефект, и он остаётся в
    // журнале; подписку из-за него терять нельзя.
    log.error("marketing.vk_callback_failed", {
      type: body.type ?? "unknown",
      error: serializeError(error),
    });
  }
  return new Response("ok", { status: 200, headers: { "Content-Type": "text/plain" } });
}
