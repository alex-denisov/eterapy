/**
 * B690 — обход комментариев VK не нужен там, где площадка их присылает сама.
 *
 * Сигнал `sweep:vk` висел на доске с 2026-08-05 и погаснуть не мог: обход зовёт
 * `wall.getComments`, а этот метод токену сообщества недоступен в принципе.
 * Текст сигнала при этом сообщал, что рабочий путь «пока не реализован».
 *
 * Замер прода 2026-08-06 показал обратное: Callback API сообщества **настроен**
 * (`VK_CALLBACK_SECRET`, `VK_CALLBACK_CONFIRMATION` заведены 2026-07-30), и
 * входящее по нему уже приходило — в `marketing_inbound_messages` есть строка
 * с площадки `vk`. То есть работающий путь существует и он не опрос, а push:
 * `wall_reply_new` прилетает на `/api/integrations/vk/callback`.
 *
 * Значит обход VK — не «недостающая возможность», а лишний опрос, который
 * ничего не добавляет и каждую минуту портит доску владельца предупреждением о
 * несуществующей проблеме.
 *
 * Граница: обход отключается ТОЛЬКО когда push настроен. Если секрет
 * Callback API снят, тишина снова становится подозрительной, и обход обязан
 * вернуться вместе со своим сигналом — иначе мы променяем шумный отказ на
 * молчаливый, а это ровно тот класс ошибки, из-за которого сторож заводили.
 */

import { vkCommentsArriveByPush } from "@/lib/marketing/engagement-sweep";

describe("B690 · push вместо невозможного опроса", () => {
  it("Callback API настроен — обход VK не нужен", () => {
    expect(vkCommentsArriveByPush({ callbackSecret: "s3cret", confirmation: "abc12345" })).toBe(true);
  });

  it("секрета нет — обход возвращается вместе со своим сигналом", () => {
    expect(vkCommentsArriveByPush({ callbackSecret: null, confirmation: "abc12345" })).toBe(false);
    expect(vkCommentsArriveByPush({ callbackSecret: "   ", confirmation: "abc12345" })).toBe(false);
  });

  it("строки подтверждения мало: без секрета маршрут ничего не принимает", () => {
    expect(vkCommentsArriveByPush({ callbackSecret: null, confirmation: null })).toBe(false);
  });

  it("подтверждение не обязано присутствовать после подключения", () => {
    // VK показывает строку подтверждения только на этапе подключения сервера;
    // после него она больше не участвует в проверке запросов.
    expect(vkCommentsArriveByPush({ callbackSecret: "s3cret", confirmation: null })).toBe(true);
  });
});
