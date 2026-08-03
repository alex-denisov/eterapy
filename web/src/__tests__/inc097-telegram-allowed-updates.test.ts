/**
 * INC-097 — кнопки премодерации SMM были мертвы, потому что Telegram не
 * доставлял `callback_query`.
 *
 * Дефект жил в `allowed_updates`: вебхук был зарегистрирован со списком
 * `["message"]`, а Telegram при вызове `setWebhook` БЕЗ этого поля сохраняет
 * предыдущее значение, а не умолчание. Один давний вызов из
 * `deploy/setup-telegram-proxy.sh` пережил все перерегистрации.
 *
 * Проверять «текст скрипта» тут мало: сломаться может любая из трёх точек
 * регистрации. Поэтому тест держит инвариант «что разбираем — то и просим» и
 * сверяет с ним обе shell-точки.
 */

import { readFileSync } from "fs";
import { join } from "path";

import { TELEGRAM_ALLOWED_UPDATES } from "@/lib/telegram";

const repoRoot = join(__dirname, "..", "..", "..");

function readDeployScript(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

describe("INC-097: allowed_updates покрывает всё, что разбирает вебхук", () => {
  it("список включает типы, у которых в вебхуке есть ветка разбора", () => {
    // Ветки в app/api/telegram/webhook/route.ts: callback_query (премодерация
    // SMM), pre_checkout_query (звёзды B529), message (всё остальное, включая
    // successful_payment, который приходит сообщением без текста).
    expect(TELEGRAM_ALLOWED_UPDATES).toContain("message");
    expect(TELEGRAM_ALLOWED_UPDATES).toContain("callback_query");
    expect(TELEGRAM_ALLOWED_UPDATES).toContain("pre_checkout_query");
  });

  it("вебхук приложения регистрируется с явным allowed_updates", async () => {
    const source = readFileSync(
      join(repoRoot, "web/src/lib/telegram.ts"),
      "utf8",
    );
    const setWebhookBlock = source.slice(source.indexOf("/setWebhook"));
    // Пропуск поля — это НЕ «умолчание», а «оставить как было». Именно так
    // дефект и пережил все последующие деплои.
    expect(setWebhookBlock).toContain("allowed_updates");
  });

  it.each([
    "deploy/setup-telegram-proxy.sh",
    "deploy/staging-bot-webhook.sh",
  ])("%s просит callback_query и pre_checkout_query", (script) => {
    const source = readDeployScript(script);
    const registration = source.slice(source.indexOf("setWebhook"));
    expect(registration).toContain("callback_query");
    expect(registration).toContain("pre_checkout_query");
  });

  it("ни одна точка регистрации не просит только message", () => {
    for (const script of ["deploy/setup-telegram-proxy.sh", "deploy/staging-bot-webhook.sh"]) {
      const source = readDeployScript(script);
      expect(source).not.toMatch(/allowed_updates[^\n]*\[\s*\\?"message\\?"\s*\]/);
    }
  });
});
