/**
 * B700 фаза 3 — проба здоровья не отменяет срок остывания.
 *
 * Замер прода 2026-08-09/10 нашёл, почему остывание B699 не работало ни дня.
 * Порядок событий, все три из живого журнала и живой базы:
 *
 *   20:57:24  Groq: «on tokens per day (TPD): Limit 200000, Used 199995 …
 *             Please try again in 59m14.928s» → ключу проставлен
 *             `cooldown_until` ≈ 21:56.
 *   21:04:49  сторож `marketing-worker.provider-health` шлёт пробу в 20 токенов
 *             той же моделью — она проходит.
 *   21:06     `select cooldown_until from ai_provider_credentials` → у GROQ
 *             **NULL**.
 *
 * `markCredentialSuccess` обнуляет `cooldownUntil` на любом успехе, а проба
 * здоровья — единственное, что вообще может обратиться к остывающему ключу:
 * рабочий трафик его не видит (`activeCredentialWhere` исключает по сроку).
 * То есть каждые пять минут сторож возвращал в пул ключ, у которого провайдер
 * забрал квоту на час. Автор писал материал, получал 429, ключ снова уходил
 * остывать — и так по кругу. Это и есть ровный расход при нуле публикаций
 * (`reference_flat_cooldown_feeds_the_shortage`).
 *
 * Граница: проба доказывает, что ключ ОТВЕЧАЕТ, а не что суточная квота
 * восстановилась. Отменить остывание вправе только настоящая работа.
 */

import { markCredentialSuccess } from "@/lib/ai-gateway/credentials";

const update = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: { aIProviderCredential: { update: (...args: unknown[]) => update(...args) } },
}));

jest.mock("@/lib/logger", () => ({
  __esModule: true,
  log: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
  serializeError: (err: unknown) => err,
}));

const dataOf = () => update.mock.calls[0][0].data as Record<string, unknown>;

beforeEach(() => {
  update.mockReset().mockResolvedValue({});
});

describe("B700 фаза 3 · проба здоровья и срок остывания", () => {
  it("настоящая работа снимает остывание — ключ доказал, что квота вернулась", async () => {
    await markCredentialSuccess({ credentialId: "cred-1" });

    expect(dataOf().cooldownUntil).toBeNull();
    expect(dataOf().regionBlocked).toBe(false);
  });

  it("проба остывание НЕ снимает: 20 токенов не доказывают суточную квоту", async () => {
    await markCredentialSuccess({ credentialId: "cred-1", probe: true });

    const data = dataOf();
    expect(data).not.toHaveProperty("cooldownUntil");
    expect(data).not.toHaveProperty("regionBlocked");
  });

  it("проба всё равно отмечает, что ключ жив", async () => {
    await markCredentialSuccess({ credentialId: "cred-1", probe: true });

    const data = dataOf();
    expect(data.lastSuccessAt).toBeInstanceOf(Date);
    expect(data.consecutiveFailures).toBe(0);
    expect(data.lastErrorCode).toBeNull();
  });
});
