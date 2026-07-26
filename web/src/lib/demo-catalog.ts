/**
 * B588 (owner 2026-07-26): «Каталог демо-профилей — оставляем только по 2
 * профилю каждого направления (эзотерика и психология), остальные отключаем».
 *
 * Витрина каталога построена на сидированных профилях (B346/B457/B459): живых
 * специалистов на платформе ещё нет. B584 закрыл к ним запись, но каталог
 * по-прежнему обещал тринадцать человек. Решение владельца — оставить ровно
 * четыре, по два на направление, как демонстрацию формата, а не как выдачу.
 *
 * Этот модуль — единственный источник списка. Его читают:
 *   - миграция B588 (гасит остальные в статус SUSPENDED);
 *   - сиды (`prisma/seed.ts`, `prisma/seed-psy-coach-practitioners.ts`) — иначе
 *     повторный прогон сида воскресил бы отключённые профили;
 *   - тест `b588-demo-catalog.test.ts`.
 *
 * Модуль намеренно без зависимостей (никакого Prisma-клиента и БД): его
 * импортируют и сиды, и клиентские тесты.
 */

/** Демо-аккаунты провижинятся по домену почты — так же, как их помечает B584. */
export const DEMO_ACCOUNT_EMAIL_SUFFIX = "@test.eterapy.com";

/** Направление каталога первого уровня (taxonomy level-1 `categories`). */
export type DemoCatalogDirection = "esoteric" | "psychology";

export interface KeptDemoProfile {
  /** Почта демо-аккаунта — стабильнее слага: слаг генерируется из имени. */
  readonly email: string;
  readonly direction: DemoCatalogDirection;
  /** Почему именно этот профиль остался — чтобы выбор не выглядел случайным. */
  readonly why: string;
}

/**
 * Ровно два профиля на направление. Критерий — покрытие ключевых продуктов
 * (таро, астрология/нумерология, КПТ, системная семейная) и наполненность
 * карточки, а не порядок в базе.
 */
export const KEPT_DEMO_PROFILES: readonly KeptDemoProfile[] = [
  {
    email: "practitioner@test.eterapy.com",
    direction: "esoteric",
    why: "астрология + нумерология, самая полная карточка каталога",
  },
  {
    email: "tarot@test.eterapy.com",
    direction: "esoteric",
    why: "таро — крупнейший эзотерический продукт платформы",
  },
  {
    email: "psy-cbt@test.eterapy.com",
    direction: "psychology",
    why: "КПТ + схема-терапия, самый частый психологический запрос",
  },
  {
    email: "psy-family@test.eterapy.com",
    direction: "psychology",
    why: "системная семейная — второй по частоте запрос",
  },
] as const;

/** Сколько профилей остаётся на каждое направление (решение владельца). */
export const KEPT_DEMO_PROFILES_PER_DIRECTION = 2;

export function isDemoAccountEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && email.toLowerCase().endsWith(DEMO_ACCOUNT_EMAIL_SUFFIX);
}

export function isKeptDemoProfile(email: string | null | undefined): boolean {
  if (typeof email !== "string") return false;
  const normalized = email.toLowerCase();
  return KEPT_DEMO_PROFILES.some((profile) => profile.email === normalized);
}

/**
 * Статус, с которым сид обязан создавать/обновлять демо-профиль. Возвращает
 * `SUSPENDED` для отключённых — иначе повторный прогон сида (а он идемпотентный
 * и запускается на стенде после каждой синхронизации БД) вернул бы девять
 * профилей в каталог, и решение владельца тихо откатилось бы.
 */
export function demoSeedPractitionerStatus(email: string | null | undefined): "ACTIVE" | "SUSPENDED" {
  if (!isDemoAccountEmail(email)) return "ACTIVE";
  return isKeptDemoProfile(email) ? "ACTIVE" : "SUSPENDED";
}

/**
 * B590 (owner 2026-07-26): «для тех что остались на платформе нужно поставить
 * все признаки прохождения проверки, пусть будут как специалисты, но пока без
 * доступных окон записи».
 *
 * Каталог обещает «проверку диплома, опыта и подписанный этический кодекс» —
 * это проверка **самой ETerapy**, и её признаки у оставшейся четвёрки должны
 * быть проставлены целиком, а не наполовину (на проде `verifiedAt` был только
 * у одного профиля из четырёх).
 *
 * Механика проверок не меняется: `assertPractitionerBookingAllowed` работает
 * как работал, и запись остаётся закрытой флагом `demoAccount` (B584) — он
 * сильнее любого из этих признаков.
 *
 * Чего здесь намеренно НЕТ: `taxStatus` / `taxReviewStatus` / реквизитов
 * выплат / ИНН. Это не «проверка ETerapy», а утверждение о налоговой
 * регистрации конкретного человека, и оно печатается на публичной странице
 * строкой «Статус: самозанятый (НПД) · ИНН …». За этими профилями людей нет,
 * поэтому такую строку выдумывать нельзя — см. хвост B588.
 */
export function demoSeedPractitionerVerified(email: string | null | undefined): boolean {
  if (!isDemoAccountEmail(email)) return false;
  return isKeptDemoProfile(email);
}

/**
 * Дата проверки для сида — фиксированная, а не `new Date()`: сид идемпотентный
 * и прогоняется повторно, плавающая дата давала бы новый диф на каждом прогоне.
 */
export const DEMO_PROFILE_VERIFIED_AT = new Date("2026-07-26T00:00:00.000Z");
