/**
 * B709 — «URL обратного вызова на деавторизацию» для Instagram.
 *
 * У Threads такой маршрут был с самого начала, у Instagram — нет, и заметил
 * это владелец 2026-08-13, читая поля в настройках приложения. Асимметрия
 * стоила бы дорого: Meta зовёт этот адрес, когда связь с аккаунтом разорвана
 * НА ЕЁ СТОРОНЕ (пользователь удалил приложение, страница отвязана, доступ
 * отозван). Без обработчика мы узнаём об этом только тогда, когда конвейер
 * попытается выпустить материал, — то есть слот уже занят, автор и редактор
 * уже оплачены, а связи нет.
 *
 * Реализация намеренно повторяет Threads один в один: подпись проверяется тем
 * же `verifyMetaSignedRequest`, отключение делает тот же
 * `disconnectMetaPlatform`, который снимает маркер, id аккаунта и срок и гасит
 * признак `enabled`. Свой вариант здесь означал бы два разных представления о
 * том, что такое «отключено».
 */

import { disconnectMetaPlatform, verifyMetaSignedRequest } from "@/lib/marketing/meta-webhooks";

export async function POST(request: Request) {
  const form = await request.formData();
  const signedRequest = form.get("signed_request");
  if (typeof signedRequest !== "string") return Response.json({ error: "Missing signed_request" }, { status: 400 });
  const payload = await verifyMetaSignedRequest("Instagram", signedRequest).catch(() => null);
  if (!payload?.user_id) return Response.json({ error: "Invalid signature" }, { status: 403 });
  await disconnectMetaPlatform("Instagram");
  return Response.json({ success: true });
}
