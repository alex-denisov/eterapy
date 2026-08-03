/**
 * B627 — уведомления о выкатке шлёт служебный бот, а не продуктовый.
 *
 * Владелец 2026-07-30: «@eterapy_deploy_bot взломали и пушат через него
 * рекламу… при этом публикации в чат с деплоем идут не от деплой-бота, а от
 * бота с приложением». Второе — настоящий дефект: токен продуктового бота
 * ходил ещё и в служебный канал, поэтому компрометация любого из двух путей
 * задевала оба. Тест держит разделение в самих workflow, а не в договорённости.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");
const WORKFLOWS = [
  ".github/workflows/deploy.yml",
  ".github/workflows/deploy-staging.yml",
  ".github/workflows/ci.yml",
  ".github/workflows/seo-report.yml",
];

function workflow(path: string) {
  return readFileSync(join(ROOT, path), "utf8");
}

describe("B627 — разделение продуктового и деплой-бота", () => {
  it.each(WORKFLOWS)("%s шлёт уведомления токеном деплой-бота", (path) => {
    const content = workflow(path);
    expect(content).toContain("TG_TOKEN: ${{ secrets.TELEGRAM_DEPLOY_BOT_TOKEN }}");
  });

  it.each(WORKFLOWS)("%s не подставляет продуктовый токен в уведомления", (path) => {
    const content = workflow(path);
    // Запасной путь на продуктовый бот здесь недопустим: он вернул бы ровно то
    // поведение, на которое пожаловался владелец, и сделал бы это молча.
    expect(content).not.toContain("TG_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}");
  });

  it("production проверяет личность ОБОИХ ботов до внешних вызовов", () => {
    const content = workflow(".github/workflows/deploy.yml");
    expect(content).toContain('identity_ok "$TG_PRODUCT_TOKEN" "eterapy_bot" "TELEGRAM_BOT_TOKEN"');
    expect(content).toContain('identity_ok "$TG_DEPLOY_TOKEN" "eterapy_deploy_bot" "TELEGRAM_DEPLOY_BOT_TOKEN"');
  });

  it("чужой продуктовый токен останавливает выкатку", () => {
    // Токен продуктового бота едет на ноды и обслуживает пользователей:
    // Mini App, вход, платежи Stars. Выкатить сюда чужой токен — сломать продукт.
    const content = workflow(".github/workflows/deploy.yml");
    expect(content).toMatch(/identity_ok "\$TG_PRODUCT_TOKEN"[\s\S]{0,80}echo "::error::\$reason"\n\s+exit 1/);
  });

  it("неисправный деплой-бот НЕ останавливает выкатку, но и не подменяется продуктовым", () => {
    // Перевёрнутый приоритет, стоивший одной остановленной выкатки
    // (run 30564617461, Telegram ответил 401): релиз не должен зависеть от
    // исправности уведомления о релизе. Молчаливого отката при этом нет —
    // уведомление просто не уходит, и в сводке run написано почему.
    const content = workflow(".github/workflows/deploy.yml");
    expect(content).toContain("уведомления о выкатке отправлены не будут. Выкатка продолжается.");
    expect(content).toContain("deploy_bot_ok=0");
    expect(content).not.toContain("TELEGRAM_DEPLOY_BOT_TOKEN || secrets.TELEGRAM_BOT_TOKEN");
  });

  it("id группы обсуждений канала доставляется выкаткой, а не вводится руками", () => {
    // Урок B566: механизм с ручным шагом — это невыполненный механизм.
    const content = workflow(".github/workflows/deploy.yml");
    expect(content).toContain("TELEGRAM_ETERAPY_CHAT_ID: ${{ secrets.TELEGRAM_ETERAPY_CHAT_ID }}");
    // Ключ должен попасть в цикл доставки на ноду. Проверяется присутствие в
    // самом цикле, а не позиция в строке: B640 добавил рядом соседний ключ, и
    // привязка к переносу строки ловила бы форматирование, а не механизм.
    const loopStart = content.indexOf("for key in ROBOKASSA_MERCHANT_LOGIN");
    const loopEnd = content.indexOf("YANDEX_CLOUD_FOLDER_ID; do", loopStart);
    expect(loopStart).toBeGreaterThan(-1);
    expect(loopEnd).toBeGreaterThan(loopStart);
    expect(content.slice(loopStart, loopEnd)).toContain("TELEGRAM_ETERAPY_CHAT_ID");
  });
});

/**
 * B627 — маркер подтверждения webhook существует до первого сохранения формы.
 *
 * Владелец 2026-07-30 получил «Callback verification failed» ровно потому, что
 * маркер рождался при первом сохранении настроек площадки: он пошёл в Meta
 * первым делом, и сравнивать было не с чем.
 */
describe("B627 — маркер webhook выводится из секрета приложения", () => {
  it("детерминирован: один и тот же секрет даёт один и тот же маркер", async () => {
    const { derivedWebhookVerifyToken } = await import("@/lib/marketing/meta-webhook-handlers");
    const first = derivedWebhookVerifyToken("Threads", "app-secret-value");
    const second = derivedWebhookVerifyToken("Threads", "app-secret-value");
    expect(first).toBe(second);
    expect(first).toMatch(/^eterapy_[A-Za-z0-9_-]{32}$/);
  });

  it("у Threads и Instagram маркеры разные при одном секрете", async () => {
    const { derivedWebhookVerifyToken } = await import("@/lib/marketing/meta-webhook-handlers");
    // Подставить чужой маркер площадка не даст, и это не педантизм: два
    // приложения Meta живут в одном аккаунте и путаются легко.
    expect(derivedWebhookVerifyToken("Threads", "same"))
      .not.toBe(derivedWebhookVerifyToken("Instagram", "same"));
  });

  it("разный секрет — разный маркер", async () => {
    const { derivedWebhookVerifyToken } = await import("@/lib/marketing/meta-webhook-handlers");
    expect(derivedWebhookVerifyToken("Instagram", "a"))
      .not.toBe(derivedWebhookVerifyToken("Instagram", "b"));
  });
});
