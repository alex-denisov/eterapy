/**
 * B706 ступень 1 — числа контракта площадки правятся без выкатки.
 *
 * ЗАЧЕМ. Вопрос владельца 2026-08-12: «имеет ли смысл весь SMM/SEO/контент
 * сделать отдельным микросервисом, чтобы не перевыкатывать приложение». Распил
 * отклонён (одна схема Prisma, один шлюз ИИ, один рельс уведомлений — вышел бы
 * распределённый монолит). Вместо него — вынести из кода то, что меняется чаще
 * всего, а меняются числа: лимиты длины, пороги призыва, хэштеги, эмодзи.
 *
 * Подбор контракта площадки — это работа в неделях: поставили 480, посмотрели,
 * поставили 420. Каждый такой шаг сегодня стоит пересборки образа и выкатки на
 * четыре ноды. После этой правки — стоит одной строки в `platform_settings`.
 *
 * ОБРАЗЕЦ ВЗЯТ ГОТОВЫЙ. Ровно так уже устроены системные промты
 * (`ai-gateway/prompts.ts`): код держит значение по умолчанию, база держит
 * живую копию, правка администратора выигрывает и НЕ затирается выкаткой.
 * Заводить второй, свой механизм здесь было бы ошибкой: два разных способа
 * переопределить настройку расходятся молча — это уже случилось с промтами.
 *
 * ГРАНИЦА. Сюда переезжает только то, что выражается числом или булевым
 * значением. Регулярки `draft-inspection.ts`, проза брифинга и логика
 * коннекторов остаются в коде: их нельзя ни провалидировать при записи, ни
 * откатить одной строкой, и правка «на живую» в проде для них опасна.
 *
 * ОТКАЗ ЧТЕНИЯ НЕ ОСТАНАВЛИВАЕТ КОНВЕЙЕР. Настройка вспомогательная: если
 * база недоступна или значение испорчено, берётся значение из кода. Молчаливая
 * остановка выпуска из-за нечитаемой настройки была бы хуже, чем работа по
 * умолчанию — см. тот же приём в `marketingProviderOrder` (B699).
 */

import { getSettings } from "@/lib/platform-settings";
import { log } from "@/lib/logger";
import {
  PLATFORM_PLAYBOOKS,
  platformContract,
  type PlatformContract,
  type CtaPolicy,
} from "@/lib/marketing/platform-playbook";

export const PLAYBOOK_SETTING_PREFIX = "marketing.playbook.";

export function playbookSettingKey(platform: string): string {
  return `${PLAYBOOK_SETTING_PREFIX}${platform.trim().toLowerCase()}`;
}

/**
 * Разумные пределы каждого поля.
 *
 * Это не придирка к администратору, а защита от опечатки, которая тихо
 * остановит выпуск. `maxCharacters: 4` пропустил бы ноль материалов, и понять
 * причину по журналу было бы нечем: материал просто не проходил бы проверку
 * длины раз за разом. Значение вне диапазона игнорируется с записью в журнал,
 * а не обрушивает разбор всей настройки.
 */
const NUMERIC_BOUNDS: Partial<Record<keyof PlatformContract, [number, number]>> = {
  minCharacters: [0, 20_000],
  maxCharacters: [50, 40_000],
  hookCharacters: [20, 2_000],
  maxTitleCharacters: [10, 300],
  maxParagraphs: [1, 100],
  maxParagraphCharacters: [50, 5_000],
  subheadingEveryCharacters: [200, 10_000],
  minHashtags: [0, 30],
  maxHashtags: [0, 30],
  maxEmoji: [0, 30],
  ctaShareOfPosts: [0, 1],
  ctaMinPosition: [0, 1],
  maxLinks: [0, 20],
  maxEllipsis: [0, 20],
  maxExclamations: [0, 20],
};

const BOOLEAN_FIELDS: readonly (keyof PlatformContract)[] = [
  "mediaBriefRequired",
  "linksClickable",
  "emDashAllowed",
];

const CTA_POLICIES: readonly CtaPolicy[] = ["required", "sparing", "discouraged"];

/** Поля, где `null` — законное значение «предела нет», а не пропуск. */
const NULLABLE_FIELDS: readonly (keyof PlatformContract)[] = [
  "maxCharacters",
  "maxTitleCharacters",
  "subheadingEveryCharacters",
];

export interface PlaybookOverrideResult {
  contract: PlatformContract;
  /** Какие поля пришли из базы — попадает в карточку площадки в суперадминке. */
  overridden: string[];
  /** Что отвергнуто и почему: администратор должен видеть свою опечатку. */
  rejected: { field: string; reason: string }[];
}

function applyOverride(
  base: PlatformContract,
  raw: unknown,
  platform: string,
): PlaybookOverrideResult {
  const overridden: string[] = [];
  const rejected: { field: string; reason: string }[] = [];
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { contract: base, overridden, rejected };
  }

  const patch: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(raw as Record<string, unknown>)) {
    const key = field as keyof PlatformContract;
    if (!(key in base)) {
      rejected.push({ field, reason: "поля нет в контракте площадки" });
      continue;
    }

    if (value === null) {
      if (!NULLABLE_FIELDS.includes(key)) {
        rejected.push({ field, reason: "у этого поля не может быть значения null" });
        continue;
      }
      patch[field] = null;
      overridden.push(field);
      continue;
    }

    if (BOOLEAN_FIELDS.includes(key)) {
      if (typeof value !== "boolean") {
        rejected.push({ field, reason: "ожидается true или false" });
        continue;
      }
      patch[field] = value;
      overridden.push(field);
      continue;
    }

    if (key === "ctaPolicy") {
      if (typeof value !== "string" || !CTA_POLICIES.includes(value as CtaPolicy)) {
        rejected.push({ field, reason: `ожидается одно из: ${CTA_POLICIES.join(", ")}` });
        continue;
      }
      patch[field] = value;
      overridden.push(field);
      continue;
    }

    const bounds = NUMERIC_BOUNDS[key];
    if (!bounds) {
      rejected.push({ field, reason: "поле не разрешено переопределять из настроек" });
      continue;
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
      rejected.push({ field, reason: "ожидается число" });
      continue;
    }
    const [min, max] = bounds;
    if (value < min || value > max) {
      rejected.push({ field, reason: `допустимо от ${min} до ${max}, пришло ${value}` });
      continue;
    }
    patch[field] = value;
    overridden.push(field);
  }

  const contract = { ...base, ...patch } as PlatformContract;

  /*
   * Взаимная согласованность полей проверяется ПОСЛЕ слияния, а не по одному:
   * `minCharacters` сам по себе законен, и незаконным его делает только
   * соседний `maxCharacters`. Противоречивая пара откатывается целиком — иначе
   * площадка получила бы контракт, который нельзя удовлетворить ничем, и все
   * её материалы уходили бы в бесконечную правку.
   */
  if (contract.maxCharacters !== null && contract.minCharacters > contract.maxCharacters) {
    rejected.push({
      field: "minCharacters/maxCharacters",
      reason: `нижняя граница ${contract.minCharacters} больше верхней ${contract.maxCharacters} — пара откачена`,
    });
    return {
      contract: { ...contract, minCharacters: base.minCharacters, maxCharacters: base.maxCharacters },
      overridden: overridden.filter((field) => field !== "minCharacters" && field !== "maxCharacters"),
      rejected,
    };
  }
  if (contract.minHashtags > contract.maxHashtags) {
    rejected.push({
      field: "minHashtags/maxHashtags",
      reason: `нижняя граница ${contract.minHashtags} больше верхней ${contract.maxHashtags} — пара откачена`,
    });
    return {
      contract: { ...contract, minHashtags: base.minHashtags, maxHashtags: base.maxHashtags },
      overridden: overridden.filter((field) => field !== "minHashtags" && field !== "maxHashtags"),
      rejected,
    };
  }

  if (rejected.length > 0) {
    log.warn("marketing.playbook_override_partially_rejected", { platform, rejected });
  }
  return { contract, overridden, rejected };
}

/** Разбор одного значения настройки. Испорченный JSON — не повод падать. */
export function parsePlaybookOverride(
  platform: string,
  rawValue: string | null | undefined,
): PlaybookOverrideResult {
  const base = platformContract(platform);
  const text = rawValue?.trim();
  if (!text) return { contract: base, overridden: [], rejected: [] };
  try {
    return applyOverride(base, JSON.parse(text), platform);
  } catch (error) {
    log.warn("marketing.playbook_override_unparsable", {
      platform,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      contract: base,
      overridden: [],
      rejected: [{ field: "*", reason: "значение не разбирается как JSON — взят контракт из кода" }],
    };
  }
}

/**
 * Контракты всех площадок с наложенными переопределениями.
 *
 * Читаем одним запросом на все площадки, а не по одной: контракт нужен в цикле
 * конвейера на каждый материал, и шесть отдельных запросов на проход были бы
 * платой ни за что.
 */
export async function resolvePlatformContracts(): Promise<Record<string, PlaybookOverrideResult>> {
  const platforms = Object.keys(PLATFORM_PLAYBOOKS);
  const fallback = () => Object.fromEntries(
    platforms.map((platform) => [
      platform,
      { contract: platformContract(platform), overridden: [], rejected: [] },
    ]),
  );

  let stored: Record<string, string>;
  try {
    stored = await getSettings(platforms.map(playbookSettingKey));
  } catch (error) {
    // Настройка вспомогательная: её отказ не должен останавливать выпуск.
    log.warn("marketing.playbook_overrides_unreadable", {
      error: error instanceof Error ? error.message : String(error),
    });
    return fallback();
  }

  return Object.fromEntries(
    platforms.map((platform) => [
      platform,
      parsePlaybookOverride(platform, stored[playbookSettingKey(platform)]),
    ]),
  );
}

export async function resolvePlatformContract(platform: string): Promise<PlatformContract> {
  const key = playbookSettingKey(platform);
  try {
    const stored = await getSettings([key]);
    return parsePlaybookOverride(platform, stored[key]).contract;
  } catch (error) {
    log.warn("marketing.playbook_override_unreadable", {
      platform,
      error: error instanceof Error ? error.message : String(error),
    });
    return platformContract(platform);
  }
}
