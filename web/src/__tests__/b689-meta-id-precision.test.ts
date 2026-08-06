/**
 * B689 — id аккаунта Meta портился о числовой тип JavaScript.
 *
 * Живая сверка 2026-08-06: площадка на `me` отвечает
 * `{"id":"27155594637449426","username":"alexey_s_denisov"}`, а в базе после
 * подключения лежало `marketing.connector.THREADS_USER_ID = 27155594637449424`
 * — на ДВА меньше.
 *
 * Причина не в площадке и не в подключении. `27155594637449426` больше
 * `Number.MAX_SAFE_INTEGER` (9007199254740991), а в ответе на обмен кода
 * `user_id` приходит ЧИСЛОМ, без кавычек. `JSON.parse` честно кладёт в него
 * ближайшее представимое значение — и `String(...)` печатает уже испорченный
 * id. Ошибка молчаливая: тип верный, длина верная, глазом не отличить.
 *
 * Цена: публикация уходит по адресу `/{user-id}/threads`, то есть в
 * несуществующий объект, и отказ площадки читается как «нет доступа», а не
 * «мы сами исказили id».
 *
 * Граница прогона: большое число доезжает дословно, обычные поля не тронуты.
 */

import { preserveMetaLargeIds } from "@/lib/marketing/meta-oauth";

describe("B689 · большой id доезжает дословно", () => {
  it("числовой user_id за пределом точности сохраняется строкой", () => {
    const raw = '{"access_token":"THAAxyz","user_id":27155594637449426}';
    const payload = JSON.parse(preserveMetaLargeIds(raw)) as { user_id: unknown };
    expect(payload.user_id).toBe("27155594637449426");
  });

  it("id тоже: тот же предел, то же лечение", () => {
    const raw = '{"id":17841400000000000,"username":"eterapy_official"}';
    const payload = JSON.parse(preserveMetaLargeIds(raw)) as { id: unknown; username: unknown };
    expect(payload.id).toBe("17841400000000000");
    expect(payload.username).toBe("eterapy_official");
  });

  it("уже строковый id не трогается", () => {
    const raw = '{"id":"27155594637449426"}';
    expect(JSON.parse(preserveMetaLargeIds(raw))).toEqual({ id: "27155594637449426" });
  });

  it("малые числа и посторонние поля остаются числами", () => {
    const raw = '{"id":12345,"expires_in":5183944,"user_id":42}';
    expect(JSON.parse(preserveMetaLargeIds(raw))).toEqual({
      id: 12345,
      expires_in: 5183944,
      user_id: 42,
    });
  });

  it("срок жизни токена не превращается в строку, даже будучи длинным", () => {
    const raw = '{"user_id":27155594637449426,"expires_in":5183944}';
    const payload = JSON.parse(preserveMetaLargeIds(raw)) as { expires_in: unknown };
    expect(typeof payload.expires_in).toBe("number");
  });
});
