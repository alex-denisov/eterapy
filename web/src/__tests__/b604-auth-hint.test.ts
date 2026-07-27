/**
 * B604 — «при переходе на кабинет шапка на секунду сбрасывается, будто меня
 * вылогинивает».
 *
 * Сессия не теряется: шапка живёт в корневом layout, а он обязан собираться
 * заранее (INC-080), поэтому в первом кадре её нет ни у кого. Лечим подсказкой:
 * видимая метка-кука → атрибут на <html> до первого кадра → CSS показывает
 * заглушку вместо кнопки «Войти».
 *
 * Здесь проверяется то, что может сломаться молча: разбор куки (в ней рядом
 * живут чужие ключи с похожими именами), симметрия «поставил / снял», и то, что
 * метка действительно снимается на выходе.
 */

import fs from "node:fs";
import path from "node:path";

import {
  AUTH_HINT_ATTR,
  AUTH_HINT_COOKIE,
  AUTH_HINT_INLINE_SCRIPT,
  hasAuthHint,
  syncAuthHint,
} from "@/lib/auth-hint";

describe("B604 · разбор метки в строке кук", () => {
  it("видит метку среди прочих кук", () => {
    expect(hasAuthHint(`foo=1; ${AUTH_HINT_COOKIE}=1; bar=2`)).toBe(true);
    expect(hasAuthHint(`${AUTH_HINT_COOKIE}=1`)).toBe(true);
  });

  it("пустая строка и отсутствие куки — не авторизован", () => {
    expect(hasAuthHint("")).toBe(false);
    expect(hasAuthHint(null)).toBe(false);
    expect(hasAuthHint("foo=1; bar=2")).toBe(false);
  });

  it("НЕ ловится на чужой куке, имя которой начинается так же", () => {
    // `eterapy-auth-once=1` — выдуманный, но ровно такой промах и делает
    // наивный `includes()`: подсказка включилась бы у человека без входа.
    expect(hasAuthHint(`${AUTH_HINT_COOKIE}-once=1`)).toBe(false);
  });

  it("снятая метка (пустое значение) читается как «не авторизован»", () => {
    expect(hasAuthHint(`${AUTH_HINT_COOKIE}=`)).toBe(false);
  });
});

describe("B604 · метка следует за сессией", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute(AUTH_HINT_ATTR);
    document.cookie = `${AUTH_HINT_COOKIE}=; path=/; max-age=0`;
  });

  it("вошёл — метка и атрибут появляются", () => {
    syncAuthHint(true);
    expect(hasAuthHint(document.cookie)).toBe(true);
    expect(document.documentElement.getAttribute(AUTH_HINT_ATTR)).toBe("1");
  });

  it("вышел — метка и атрибут снимаются", () => {
    syncAuthHint(true);
    syncAuthHint(false);
    expect(hasAuthHint(document.cookie)).toBe(false);
    expect(document.documentElement.hasAttribute(AUTH_HINT_ATTR)).toBe(false);
  });
});

describe("B604 · метка ничего не разрешает", () => {
  it("значение метки — константа, в неё нечего положить", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/auth-hint.ts"),
      "utf8",
    );
    // Ни идентификатора, ни роли: подделка даёт ровно одну возможность —
    // показать самому себе серую пилюлю на долю секунды.
    expect(source).not.toMatch(/userId|role|email/);
  });

  it("выход гасит метку вместе с сессионными куками", () => {
    const logout = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/auth/logout/route.ts"),
      "utf8",
    );
    expect(logout).toContain("AUTH_HINT_COOKIE");
  });
});

describe("B604 · пре-paint скрипт", () => {
  // Гоняем сам скрипт по настоящему документу: подмена глобального `document`
  // в jsdom невозможна, а проверять хочется именно ту строку, которая уедет в
  // <head> — она и хешируется в CSP.
  const run = (cookies: readonly string[]) => {
    document.documentElement.removeAttribute(AUTH_HINT_ATTR);
    document.cookie = `${AUTH_HINT_COOKIE}=; path=/; max-age=0`;
    document.cookie = "other=; path=/; max-age=0";
    for (const cookie of cookies) document.cookie = `${cookie}; path=/`;
    // eslint-disable-next-line no-eval
    (0, eval)(AUTH_HINT_INLINE_SCRIPT);
    return document.documentElement.getAttribute(AUTH_HINT_ATTR);
  };

  it("ставит атрибут по метке и молчит без неё", () => {
    expect(run([`${AUTH_HINT_COOKIE}=1`])).toBe("1");
    expect(run(["other=1", `${AUTH_HINT_COOKIE}=1`])).toBe("1");
    expect(run(["other=1"])).toBeNull();
  });
});
