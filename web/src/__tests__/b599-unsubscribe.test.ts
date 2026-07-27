/**
 * B599 · Отписка. Пункт приёмки: в рекламном сообщении обязана быть рабочая
 * ссылка отказа, и отказ обязан исполняться немедленно (38-ФЗ ст. 18).
 *
 * Здесь проверяется то, что ломается молча: подделка подписи, чужой токен,
 * отписка на GET (её бы выполнили почтовые сканеры вместо человека) и — главное
 * — что ссылка приклеена ОТПРАВИТЕЛЕМ, а не оставлена на совесть шаблона.
 */

import fs from "node:fs";
import path from "node:path";

import {
  UNSUBSCRIBE_PATH,
  createUnsubscribeToken,
  parseUnsubscribeToken,
  unsubscribeUrl,
  withUnsubscribeFooter,
} from "@/lib/marketing/unsubscribe";

describe("B599 · токен отписки", () => {
  it("свой токен разбирается обратно в того же человека", () => {
    const token = createUnsubscribeToken("user-42");
    expect(parseUnsubscribeToken(token)).toBe("user-42");
  });

  it("подделанная подпись не проходит", () => {
    const token = createUnsubscribeToken("user-42");
    const forged = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
    expect(parseUnsubscribeToken(forged)).toBeNull();
  });

  it("чужую подпись нельзя пришить к другому идентификатору", () => {
    const signature = createUnsubscribeToken("user-42").split(".").pop();
    expect(parseUnsubscribeToken(`user-43.${signature}`)).toBeNull();
  });

  it("мусор и пустое значение — отказ, а не исключение", () => {
    expect(parseUnsubscribeToken(null)).toBeNull();
    expect(parseUnsubscribeToken("")).toBeNull();
    expect(parseUnsubscribeToken("нет-точки")).toBeNull();
    expect(parseUnsubscribeToken(".подпись")).toBeNull();
  });

  it("токен не устаревает: ссылка из письма годовой давности обязана работать", () => {
    // Сознательное решение — см. комментарий в `unsubscribe.ts`. Прогон
    // фиксирует его, чтобы «а давайте добавим срок» проходило через обсуждение.
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/marketing/unsubscribe.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/expiresAt|maxAgeMs|Date\.now\(\)/);
  });
});

describe("B599 · ссылка в письме", () => {
  it("ведёт на публичную страницу отписки с токеном", () => {
    const url = unsubscribeUrl("user-42", "https://eterapy.com/");
    expect(url.startsWith(`https://eterapy.com${UNSUBSCRIBE_PATH}?t=`)).toBe(true);
    const token = new URL(url).searchParams.get("t");
    expect(parseUnsubscribeToken(token)).toBe("user-42");
  });

  it("приписка добавляется к телу и называет сообщение рекламным", () => {
    const body = withUnsubscribeFooter("Привет", "https://eterapy.com/unsubscribe?t=x");
    expect(body).toContain("Привет");
    expect(body).toContain("рекламное сообщение");
    expect(body).toContain("https://eterapy.com/unsubscribe?t=x");
  });
});

describe("B599 · ссылку клеит отправитель, а не шаблон", () => {
  const dispatch = fs.readFileSync(
    path.join(process.cwd(), "src/lib/marketing/dispatch.ts"),
    "utf8",
  );

  it("тело письма проходит через withUnsubscribeFooter", () => {
    expect(dispatch).toContain("withUnsubscribeFooter(");
  });

  it("в журнал попадает то же тело, что ушло человеку", () => {
    // Один `body` на доставку и на запись: две разные строки означали бы, что
    // снимок в журнале не доказывает ничего.
    expect(dispatch.match(/const body = /g)?.length).toBe(1);
  });
});

describe("B599 · отписка не выполняется по GET", () => {
  const route = fs.readFileSync(
    path.join(process.cwd(), "src/app/api/marketing/unsubscribe/route.ts"),
    "utf8",
  );

  it("маршрут отвечает только на POST", () => {
    expect(route).toContain("export async function POST");
    expect(route).not.toContain("export async function GET");
  });

  it("страница отписки не сама себя отправляет — там кнопка", () => {
    const form = fs.readFileSync(
      path.join(process.cwd(), "src/app/unsubscribe/unsubscribe-form.tsx"),
      "utf8",
    );
    expect(form).toContain("onClick");
    expect(form).toContain('method: "POST"');
  });
});
