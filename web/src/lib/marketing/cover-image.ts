/**
 * B732 — ПЛАТНАЯ ОБЛОЖКА ДЛЯ ДЗЕНА И INSTAGRAM.
 *
 * Решение владельца 2026-09-07 дословно: «да, картинки для Дзена и Instagram
 * одобряю, $1,13 нормально». Это 29 постов в месяц по $0,039 за картинку.
 * Остальные площадки остаются на 0-токенных шаблонах Satori (B718, B731) — не
 * ради экономии, а потому что шаблон повторяем, мгновенен и не выдумывает лиц.
 *
 * ПОЧЕМУ СТАРЫЙ МОДУЛЬ НЕ «ВКЛЮЧАЛИ ФЛАГОМ». `image-generation.ts` (B725) был
 * выкачен мёртвым и не мог работать в принципе: он целился в выключенную Google
 * `imagen-3.0-generate-002`, откатывался на `flux-1-schnell`, которой нет в
 * каталоге OpenRouter, а ключ читал из `process.env.GEMINI_API_KEY`, которого в
 * контейнере нет и не было. Учётки Gemini живут в хранилище шлюза
 * ([[reference_llm_host_differs_from_key_name]]), поэтому модуль переписан, а не
 * включён.
 *
 * ТРИ ПРАВИЛА, КОТОРЫЕ ЗДЕСЬ ГЛАВНЫЕ.
 *
 * 1. ОДНА КАРТИНКА — ОДИН РАЗ. Байты кладутся в базу под ключом материала.
 *    Обложку скачивает Meta, Дзен и кто угодно ещё, сколько угодно раз; если бы
 *    картинка рисовалась на каждый заход по URL, одобренные $1,13/мес
 *    превратились бы в счёт, зависящий от числа обращений к файлу.
 * 2. ПОТОЛОК СУТОЧНЫЙ И СЧИТАЕТСЯ В БАЗЕ, а не в памяти процесса: нод четыре,
 *    и счётчик в памяти считал бы четверть расхода. Механизм тот же, что у
 *    платного маршрута моделей (B719): строка `ai_budget_ledger`.
 * 3. ОТКАТ НА ШАБЛОН ГРОМКИЙ. Любой сбой — нет учётки, отказ модели, пустой
 *    ответ, исчерпанный потолок — возвращает `null`, материал уходит с обложкой
 *    Satori, и причина ПИШЕТСЯ в лог. Молчащий откат неотличим от работающего
 *    механизма — ровно так три захода подряд считались выкаченными (B727).
 */

import { AIProvider, Prisma } from "@prisma/client";
import db from "@/lib/db";
import { aiBudgetPeriod } from "@/lib/ai-gateway/domain";
import { pickCredentialForProvider, type DecryptedAICredential } from "@/lib/ai-gateway/credentials";
import { log, serializeError } from "@/lib/logger";
import { coverCanvas } from "@/lib/marketing/cover-art";
import { stripImageMetadata } from "@/lib/marketing/image-hygiene";

/**
 * Площадки, где шаблон проигрывает картинке.
 *
 * Дзен — обложка стоит в ленте рядом с фотографиями; Instagram — витрина.
 * Расширять список без решения владельца нельзя: каждая строка здесь это
 * деньги, а не настройка.
 */
export const PAID_COVER_PLATFORMS = ["dzen", "instagram"] as const;

/** Модель — та, что владелец одобрил по цене. */
export const PAID_COVER_MODEL = "gemini-2.5-flash-image";

/** $0,039 за картинку — цена, по которой считался одобренный расход. */
export const PAID_COVER_COST_MICROS = 39;

/**
 * Сколько картинок в сутки максимум.
 *
 * Такт даёт 29 постов Дзена и Instagram в месяц — около одной картинки в сутки.
 * Потолок в две штуки оставляет запас на догоняющий слот и при этом жёстко
 * ограничивает худший случай ~$2,3/мес: даже если конвейер сойдёт с ума, счёт
 * не уедет на порядок. Потолок задан ЧИСЛОМ КАРТИНОК, а не долларами, потому
 * что цена фиксированная, а «сколько картинок в день» владелец может проверить
 * глазами.
 */
export const PAID_COVER_DAILY_LIMIT = Number(
  process.env.MARKETING_PAID_COVER_DAILY_LIMIT || 2,
);

const LEDGER_SCOPE_TYPE = "marketing-cover-image";
const LEDGER_SCOPE_KEY = "gemini-image";
const REQUEST_TIMEOUT_MS = 45_000;

export function isPaidCoverPlatform(platform: string): boolean {
  return (PAID_COVER_PLATFORMS as readonly string[]).includes(platform.trim().toLowerCase());
}

/** Сколько картинок нарисовано за сутки UTC. */
export async function paidCoversToday(period = aiBudgetPeriod(), client = db): Promise<number> {
  const rows = await client.$queryRaw<Array<{ request_count: unknown }>>(Prisma.sql`
    SELECT request_count FROM ai_budget_ledger
    WHERE scope_type = ${LEDGER_SCOPE_TYPE}
      AND scope_key = ${LEDGER_SCOPE_KEY}
      AND period = ${period}
    LIMIT 1
  `);
  const raw = rows[0]?.request_count;
  const value = typeof raw === "bigint" ? Number(raw) : Number(raw ?? 0);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Записать расход.
 *
 * ⚠ Пишется ПОСЛЕ удачной генерации: у картинки, в отличие от токенов, отказ
 * ничего не стоит — деньги берут за отданный файл. Зато удачная и НЕ пригодная
 * картинка оплачена полностью, поэтому запись стоит до всякой проверки
 * пригодности.
 */
export async function recordPaidCoverSpend(period = aiBudgetPeriod(), client = db): Promise<void> {
  await client.$executeRaw(Prisma.sql`
    INSERT INTO ai_budget_ledger (id, scope_type, scope_key, period, tokens, cost_micros, request_count, created_at, updated_at)
    VALUES (gen_random_uuid()::text, ${LEDGER_SCOPE_TYPE}, ${LEDGER_SCOPE_KEY}, ${period},
            0, ${PAID_COVER_COST_MICROS}, 1, NOW(), NOW())
    ON CONFLICT (scope_type, scope_key, period)
    DO UPDATE SET
      cost_micros = ai_budget_ledger.cost_micros + EXCLUDED.cost_micros,
      request_count = ai_budget_ledger.request_count + 1,
      updated_at = NOW()
  `);
}

/**
 * Промт картинки.
 *
 * ⚠ ЛЮДЕЙ И ТЕКСТА НА КАРТИНКЕ НЕ ПРОСИМ. Лица и пальцы модель рисует
 * узнаваемо-неправильно, а надпись на чужом языке в обложке материала на
 * русском выдаёт генерацию мгновенно. Требования сформулированы запретами
 * прямо в промте: «без текста, без лиц» модель соблюдает заметно лучше, чем
 * пожелание «фотореалистично».
 */
export function paidCoverPrompt(input: {
  platform: string;
  title: string;
  cluster?: string | null;
  mediaBrief?: string | null;
}): string {
  const canvas = coverCanvas(input.platform);
  const brief = input.mediaBrief?.replace(/\s+/gu, " ").trim();
  return [
    `Обложка для материала «${input.title}»${input.cluster ? ` из темы «${input.cluster}»` : ""}.`,
    brief ? `Замысел: ${brief}.` : null,
    "Атмосферная предметная сцена: свет, фактура, предметы быта, интерьер или природа.",
    "БЕЗ людей и лиц. БЕЗ любого текста, надписей, букв, цифр и логотипов.",
    "БЕЗ эзотерической атрибутики: карт таро, рун, хрустальных шаров, астрологических знаков.",
    "Спокойный приглушённый свет, натуральные текстуры, никакого пластика и неона.",
    `Пропорция кадра ${canvas.width}:${canvas.height}.`,
  ].filter(Boolean).join(" ");
}

interface GeminiImageResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> };
  }>;
  error?: { message?: string };
}

export interface PaidCoverResult {
  mimeType: string;
  bytes: Buffer;
  model: string;
}

/**
 * Нарисовать и сохранить обложку. `null` означает «идём на шаблон Satori».
 *
 * Зависимости вынесены во вход не ради вкуса: без этого прогон либо ходил бы в
 * сеть, либо не существовал вовсе.
 */
export async function generatePaidCover(input: {
  key: string;
  platform: string;
  title: string;
  cluster?: string | null;
  mediaBrief?: string | null;
  fetchImpl?: typeof fetch;
  pickCredentialImpl?: typeof pickCredentialForProvider;
  client?: typeof db;
  period?: string;
}): Promise<PaidCoverResult | null> {
  const client = input.client ?? db;
  const platform = input.platform.trim().toLowerCase();
  if (!isPaidCoverPlatform(platform)) return null;

  const period = input.period ?? aiBudgetPeriod();
  let credential: DecryptedAICredential | null = null;
  try {
    const drawnToday = await paidCoversToday(period, client);
    if (drawnToday >= PAID_COVER_DAILY_LIMIT) {
      // Потолок — не ошибка, но и не тишина: без этой строки исчерпание
      // выглядит как «механизм не работает».
      log.warn("marketing.cover_image.daily_limit_reached", {
        key: input.key, platform, drawnToday, limit: PAID_COVER_DAILY_LIMIT,
      });
      return null;
    }

    const pick = input.pickCredentialImpl ?? pickCredentialForProvider;
    credential = await pick({ provider: AIProvider.GEMINI });
    if (!credential?.apiKey) {
      log.warn("marketing.cover_image.no_credential", { key: input.key, platform });
      return null;
    }

    const prompt = paidCoverPrompt({
      platform, title: input.title, cluster: input.cluster, mediaBrief: input.mediaBrief,
    });
    const baseUrl = credential.baseUrlOverride?.replace(/\/+$/u, "")
      || "https://generativelanguage.googleapis.com/v1beta";
    const fetchImpl = input.fetchImpl ?? fetch;
    const response = await fetchImpl(
      `${baseUrl}/models/${PAID_COVER_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Ключ уходит ЗАГОЛОВКОМ, а не параметром адреса: строка запроса
          // попадает в журналы прокси целиком.
          "x-goog-api-key": credential.apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ["IMAGE"] },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      log.warn("marketing.cover_image.request_failed", {
        key: input.key, platform, status: response.status, detail: detail.slice(0, 400),
      });
      return null;
    }

    const payload = await response.json() as GeminiImageResponse;
    const part = payload.candidates?.[0]?.content?.parts?.find((item) => item.inlineData?.data);
    const data = part?.inlineData?.data;
    if (!data) {
      // Модель вправе ответить текстом вместо картинки — например, отказом
      // модерации. Это не сбой сети, и путать их в логе нельзя.
      log.warn("marketing.cover_image.no_image_in_response", {
        key: input.key, platform, error: payload.error?.message?.slice(0, 200),
      });
      return null;
    }

    // Расход записывается СРАЗУ после получения файла: картинка уже оплачена,
    // что бы с ней ни случилось дальше.
    await recordPaidCoverSpend(period, client);

    const mimeType = part?.inlineData?.mimeType || "image/png";
    // C2PA и EXIF снимаются ДО записи в базу: наружу отдаётся ровно то, что
    // лежит, и второго места для очистки не существует.
    const bytes = await stripImageMetadata(Buffer.from(data, "base64"));

    // Prisma ждёт `Uint8Array` с обычным `ArrayBuffer`; у `Buffer` тип буфера
    // шире (допускает `SharedArrayBuffer`), и без явного приведения сборка
    // валится в типах, а не в рантайме.
    const stored = new Uint8Array(bytes);
    await client.marketingCoverImage.upsert({
      where: { key: input.key },
      create: {
        key: input.key, platform, mimeType, bytes: stored, model: PAID_COVER_MODEL,
        costMicros: PAID_COVER_COST_MICROS, prompt,
      },
      update: { platform, mimeType, bytes: stored, model: PAID_COVER_MODEL, prompt },
    });

    log.info("marketing.cover_image.generated", {
      key: input.key, platform, model: PAID_COVER_MODEL, bytes: bytes.length,
    });
    return { mimeType, bytes, model: PAID_COVER_MODEL };
  } catch (error) {
    // Обложка НИКОГДА не роняет выпуск: материал выйдет с шаблоном.
    log.warn("marketing.cover_image.failed_falling_back_to_template", {
      key: input.key, platform, error: serializeError(error),
    });
    return null;
  }
}

/** Готовая картинка материала, если она есть. */
export async function storedPaidCover(key: string, client = db) {
  return client.marketingCoverImage.findUnique({
    where: { key },
    select: { mimeType: true, bytes: true },
  });
}
