/**
 * B700 — «запрос больше потолка модели» лечился как случайная осечка.
 *
 * Замер прода 2026-08-10 за 13 часов после батча 45: из 726 отказов автора
 * 713 — `HTTP_413` у GROQ. Тело ответа дословно:
 *
 *   Request too large for model `qwen/qwen3.6-27b` … service tier `on_demand`
 *   on tokens per minute (TPM): Limit 8000, Requested 8234
 *
 * Это не квота и не осечка. Мы просим 8234 токена у модели с МИНУТНЫМ потолком
 * 8000: такой запрос не проходит ни в какую минуту, потому что ожидание не
 * меняет его размер. `classifyCredentialFailure` кода `HTTP_413` не знала и
 * отдавала его в общее правило «минута остывания». Отсюда и ритм отказов —
 * ровно один в минуту, тринадцать часов подряд:
 *
 *   08-08   0 отказов 413,  24 успеха
 *   08-09  45 отказов 413,  22 успеха
 *   08-10 671 отказ  413,   0 успехов
 *
 * Каждый такой отказ списывал обращение из бюджета материала (B680, 12 на
 * материал): материал мог сжечь бюджет целиком, ни разу не дойдя до живой
 * модели.
 *
 * Отличать структурное несовпадение от временного перебора обязательно: тот же
 * код 413 провайдер отдаёт и когда минутный потолок ВРЕМЕННО выбран соседними
 * запросами. Там ожидание помогает, и наказывать ключ часом нельзя.
 */

import {
  classifyCredentialFailure,
  oversizedRequestFromProviderMessage,
  MAX_CREDENTIAL_COOLDOWN_MS,
} from "@/lib/ai-gateway/cooldown";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const GROQ_413 = "Request too large for model `qwen/qwen3.6-27b` in organization "
  + "`org_01kmkt22nbf3wr9wn3y6czsyvt` service tier `on_demand` on tokens per minute "
  + "(TPM): Limit 8000, Requested 8234. Please try again in 1.755s";

describe("B700 · 413 «запрос больше потолка» — свойство запроса, а не минуты", () => {
  describe("разбор пары «Limit / Requested»", () => {
    it("читает потолок и размер запроса из ответа Groq", () => {
      expect(oversizedRequestFromProviderMessage(GROQ_413)).toEqual({
        limit: 8000,
        requested: 8234,
      });
    });

    it("молчит там, где пары нет", () => {
      expect(oversizedRequestFromProviderMessage("429 Rate limit reached")).toBeNull();
      expect(oversizedRequestFromProviderMessage(undefined)).toBeNull();
      expect(oversizedRequestFromProviderMessage("")).toBeNull();
    });

    it("не считает перебором запрос, уложившийся в потолок", () => {
      // Тот же код 413 приходит, когда минуту выбрали соседние запросы:
      // сам запрос помещается, и ждать имеет смысл.
      expect(
        oversizedRequestFromProviderMessage(
          "Request too large … on tokens per minute (TPM): Limit 8000, Requested 6100",
        ),
      ).toBeNull();
    });
  });

  describe("срок остывания", () => {
    it("даёт час, когда один наш запрос больше всего минутного потолка", () => {
      expect(classifyCredentialFailure("HTTP_413", { providerMessage: GROQ_413 })).toEqual({
        cooldownMs: HOUR,
        regionBlocked: false,
      });
    });

    it("НЕ читает «try again in 1.755s» из такого ответа", () => {
      // Ловушка: Groq вежливо предлагает повторить через секунду. Повтор через
      // секунду — это и есть тот самый отказ раз в минуту, тринадцать часов.
      const { cooldownMs } = classifyCredentialFailure("HTTP_413", {
        providerMessage: GROQ_413,
      });
      expect(cooldownMs).toBeGreaterThan(MINUTE);
    });

    it("временный перебор минуты остаётся коротким ожиданием", () => {
      expect(
        classifyCredentialFailure("HTTP_413", {
          providerMessage: "Request too large … (TPM): Limit 8000, Requested 6100. "
            + "Please try again in 12s",
        }),
      ).toEqual({ cooldownMs: 12_000, regionBlocked: false });
    });

    it("413 без пояснений ждёт минуту, а не сутки", () => {
      // Пустой ответ не доказывает структурного несовпадения: наказывать ключ
      // на час по догадке нельзя.
      expect(classifyCredentialFailure("HTTP_413")).toEqual({
        cooldownMs: MINUTE,
        regionBlocked: false,
      });
    });

    it("час — это не вечность: ключ возвращается тем же днём", () => {
      const { cooldownMs } = classifyCredentialFailure("HTTP_413", {
        providerMessage: GROQ_413,
      });
      expect(cooldownMs).toBeLessThan(MAX_CREDENTIAL_COOLDOWN_MS);
    });
  });
});
