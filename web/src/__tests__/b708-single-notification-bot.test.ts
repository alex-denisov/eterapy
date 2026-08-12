/**
 * B708 — уведомления шлёт ОДИН бот. Отдельным остаётся только бот поддержки.
 *
 * Решение владельца 2026-08-13, третье напоминание: «свести все уведомления в
 * один бот и оставить только отдельный бот поддержки».
 *
 * ЧТО БЫЛО ДО. B627 развёл продуктовый и служебный боты после жалобы владельца
 * 2026-07-30: «@eterapy_deploy_bot взломали и пушат через него рекламу… при
 * этом публикации в чат с деплоем идут не от деплой-бота, а от бота с
 * приложением». Тогда разделение было правильным ответом.
 *
 * ПОЧЕМУ ОБРАТНАЯ ПРАВКА НЕ ВОЗВРАЩАЕТ ТОТ РИСК. Взломан был служебный бот, и
 * ровно он выводится из обращения. Токен продуктового бота и так лежит в
 * секретах Actions, и так едет на ноды, и `seo-route.yml` и так слал им
 * уведомления — новой поверхности атаки не появляется.
 *
 * ⚠ ЧТО ПРАВКА ВСЁ-ТАКИ СТОИТ. Компрометация продуктового токена теперь
 * задевает и служебный канал. Это принятая владельцем цена, а не недосмотр.
 *
 * Тест держит новое правило в самих workflow, а не в договорённости: молчаливый
 * возврат второго бота он завалит.
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

describe("B708 — уведомления шлёт один бот", () => {
  it.each(WORKFLOWS)("%s шлёт уведомления токеном @eterapy_bot", (path) => {
    const content = workflow(path);
    expect(content).toContain("TG_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}");
  });

  it.each([...WORKFLOWS, ".github/workflows/seo-route.yml"])(
    "%s не упоминает деплой-бота ни в каком виде",
    (path) => {
      // Второй бот выведен из обращения целиком. Оставленное упоминание — это
      // ровно тот путь, которым он вернётся: секрет в репозитории живёт дольше
      // решения о нём.
      expect(workflow(path)).not.toContain("TELEGRAM_DEPLOY_BOT_TOKEN");
    },
  );

  it("production проверяет личность продуктового бота до внешних вызовов", () => {
    const content = workflow(".github/workflows/deploy.yml");
    expect(content).toContain('identity_ok "$TG_PRODUCT_TOKEN" "eterapy_bot" "TELEGRAM_BOT_TOKEN"');
  });

  it("чужой продуктовый токен останавливает выкатку", () => {
    // Токен продуктового бота едет на ноды и обслуживает пользователей:
    // Mini App, вход, платежи Stars. Выкатить сюда чужой токен — сломать продукт.
    const content = workflow(".github/workflows/deploy.yml");
    expect(content).toMatch(/identity_ok "\$TG_PRODUCT_TOKEN"[\s\S]{0,80}echo "::error::\$reason"\n\s+exit 1/);
  });

  it("бот поддержки остаётся отдельным и в уведомления не втягивается", () => {
    // Граница, которую владелец назвал прямо: один бот на уведомления, отдельный
    // на поддержку. @eterapy_support_bot ведёт супергруппу — если его втянуть
    // сюда, он начнёт отвечать «/start» на каждое служебное сообщение (B7).
    const telegram = readFileSync(join(ROOT, "web/src/lib/telegram.ts"), "utf8");
    expect(telegram).toContain("TELEGRAM_SUPPORT_BOT_TOKEN");
    for (const path of WORKFLOWS) {
      expect(workflow(path)).not.toContain("TELEGRAM_SUPPORT_BOT_TOKEN");
    }
  });

  it("id группы обсуждений канала доставляется выкаткой, а не вводится руками", () => {
    // Урок B566: механизм с ручным шагом — это невыполненный механизм.
    const content = workflow(".github/workflows/deploy.yml");
    expect(content).toContain("TELEGRAM_ETERAPY_CHAT_ID: ${{ secrets.TELEGRAM_ETERAPY_CHAT_ID }}");
    // Ключ должен попасть в цикл доставки на ноду. Проверяется присутствие в
    // самом цикле, а не позиция в строке: B640 добавил рядом соседний ключ, и
    // привязка к переносу строки ловила бы форматирование, а не механизм.
    const loopStart = content.indexOf("for key in ROBOKASSA_MERCHANT_LOGIN");
    // Конец цикла ищем по САМОЙ КОНСТРУКЦИИ `; do`, а не по имени последнего
    // ключа: B650 дописал ключи Google после `YANDEX_CLOUD_FOLDER_ID`, и якорь
    // на конкретное имя сломался, хотя механизм доставки не изменился ничем.
    const loopEnd = content.indexOf("; do", loopStart);
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
