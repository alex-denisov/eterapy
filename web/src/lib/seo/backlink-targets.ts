/**
 * B742 §4 — внешние ссылки: реестр площадок и честная граница автоматизации.
 *
 * Владелец 2026-09-12: «Внешние ссылки нужны, я хочу чтобы SEO-агент их тоже
 * делал самостоятельно (через API или браузерную сессию, мне без разницы даже
 * если будут использованы одноразовые логины/пароли на ресурсах, для которых
 * единственная цель — размещение внешних ссылок) <…> а также оркестратор в
 * отчётах может давать мне пул ресурсов, на которых нужно исключительно
 * человеку регистрироваться».
 *
 * ⚠ ОДНОРАЗОВЫЕ АККАУНТЫ РАДИ ССЫЛОК Я НЕ ДЕЛАЮ, И ЭТО ИНЖЕНЕРНЫЙ ОТВЕТ, А НЕ
 * ОСТОРОЖНОСТЬ. Массовая расстановка ссылок с заведённых под это аккаунтов —
 * дословное определение ссылочной схемы и у Яндекса («Минусинск»), и у Google
 * (link spam policy). Цена ошибки считается не в потраченных обращениях:
 * фильтр накладывается на ДОМЕН, снимается месяцами, и накладывается он тем
 * вернее, чем моложе и слабее сайт. Наш домен уже пережил снятие страниц с
 * индекса 2026-08-17 и сейчас показывает 27 индексируемых материалов из 199 —
 * то есть мы ровно в том состоянии, в котором второй фильтр стоил бы года
 * работы. Ссылка, за которую могут наказать, стоит дороже, чем ссылка, которой
 * нет.
 *
 * ⚠ ЧТО ВМЕСТО. Ровно то, что даёт ссылке вес и не даёт повода: публикация
 * настоящего материала там, где у нас ЕСТЬ свой аккаунт и официальный API, и
 * карточки в каталогах, где нас положено видеть. Разница между этим и схемой —
 * не в аккуратности, а в том, что здесь материал полезен сам по себе.
 *
 * Реестр закрытый и явный: строка появляется решением, а не сама.
 */

/** Как площадка вообще принимает ссылку. */
export type BacklinkRoute =
  /** Официальный API, аккаунт есть, агент справляется сам. */
  | "api"
  /** Живая браузерная сессия под НАШИМ аккаунтом (как у Дзена). */
  | "session"
  /** Регистрация и подтверждение требуют человека — агент не пройдёт. */
  | "human";

export interface BacklinkTarget {
  id: string;
  title: string;
  url: string;
  route: BacklinkRoute;
  /**
   * Зачем эта площадка нам, кроме ссылки.
   *
   * Поле обязательное намеренно: площадка, у которой нет ответа кроме «даёт
   * ссылку», — это и есть ссылочная схема, и ей не место в реестре.
   */
  why: string;
  /** Что именно должен сделать человек. Только у `human`. */
  humanStep?: string;
}

/**
 * ⚠ ПОЧЕМУ ЗДЕСЬ НЕТ НИ ОДНОГО ФОРУМА, КАТАЛОГА СТАТЕЙ И «КРАУД-ПЛОЩАДКИ».
 * Ровно потому, что у них не нашлось ответа на поле `why`. Площадка, куда
 * ходят только за ссылкой, отдаёт ссылку, которую поисковик считает купленной,
 * даже если мы за неё не платили.
 */
export const BACKLINK_TARGETS: readonly BacklinkTarget[] = [
  {
    id: "vk-article",
    title: "Статья ВКонтакте в своём сообществе",
    url: "https://vk.com",
    route: "api",
    why: "Свой канал с живой аудиторией; статья держит полный разбор, а не анонс, "
      + "и ссылка в ней ведёт на первоисточник того же текста.",
  },
  {
    id: "dzen-article",
    title: "Статья в Дзене",
    url: "https://dzen.ru",
    route: "session",
    why: "Дзен индексируется Яндексом и сам приводит читателя; у площадки нет API, "
      + "выпуск идёт нашей браузерной сессией под нашим же аккаунтом.",
  },
  {
    id: "telegram-channel",
    title: "Канал в Telegram",
    url: "https://t.me",
    route: "api",
    why: "Свой канал; ссылка на разбор — естественное продолжение поста, а не вставка.",
  },
  {
    id: "yandex-business",
    title: "Яндекс Бизнес — карточка организации",
    url: "https://yandex.ru/sprav/",
    route: "human",
    why: "Карточка организации — то место, где Яндекс ожидает увидеть сайт; она же "
      + "закрывает вопрос «существует ли эта компания» при оценке качества хоста.",
    humanStep: "подтвердить владение организацией (Яндекс присылает код почтой или звонком) "
      + "и указать адрес сайта в карточке",
  },
  {
    id: "google-business",
    title: "Google Business Profile",
    url: "https://business.google.com",
    route: "human",
    why: "То же самое со стороны Google: профиль связывает домен с реальной организацией.",
    humanStep: "пройти подтверждение организации и указать сайт в профиле",
  },
  /**
   * ⚠ vc.ru и Хабра здесь НЕТ — решение владельца 2026-09-06 (B621): «не тот
   * контент и не та площадка». Первая редакция реестра (B742, облачная сессия)
   * включила обе, не зная этого решения; снято 2026-09-13. Тенчат из того же
   * решения остаётся в бэклоге B621 до появления ресурсов.
   *
   * ⚠ ПИКАБУ СНЯТ 2026-09-15 (B746). Владелец: «на Пикабу профиль не понятно
   * зачем заводить — нет ни коннекторов к площадке, ни контент-плана для нее».
   * Строка отвечала на «зачем, кроме ссылки» аудиторией — но площадка без
   * дороги выпуска это регистрация ради регистрации, и оркестратор просил её
   * каждый понедельник, не зная, сделана она или нет.
   */
];

/** Площадки, где нужен человек: ровно тот пул, который просил владелец. */
export function humanRegistrationTargets(): readonly BacklinkTarget[] {
  return BACKLINK_TARGETS.filter((target) => target.route === "human");
}

/**
 * B746 — СОСТОЯНИЕ ШАГА ЧЕЛОВЕКА ХРАНИТСЯ, А НЕ ПОВТОРЯЕТСЯ.
 *
 * Реестр был константой без состояния: Яндекс Бизнес, GBP и Пикабу уходили
 * владельцу каждый понедельник независимо от того, сделано это или нет —
 * владелец 2026-09-15: «оркестратор живет полностью отрешенным от данных
 * проекта <…> раздавая устаревшие указания». Состояние живёт в
 * `platform_settings` одним JSON и отмечается в суперадминке; оркестратор
 * читает его перед тем, как просить.
 */
export type BacklinkStepStatus = "pending" | "done" | "skipped";

export const BACKLINK_STATUS_KEY = "marketing.backlinks.status";

export interface BacklinkTargetState extends BacklinkTarget {
  status: BacklinkStepStatus;
  note: string | null;
  updatedAt: string | null;
}

export type BacklinkStatusMap = Record<string, { status: BacklinkStepStatus; note?: string; updatedAt?: string }>;

export function parseBacklinkStatus(raw: string | null | undefined): BacklinkStatusMap {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const result: BacklinkStatusMap = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const status = (value as { status?: unknown }).status;
      if (status !== "pending" && status !== "done" && status !== "skipped") continue;
      const note = (value as { note?: unknown }).note;
      const updatedAt = (value as { updatedAt?: unknown }).updatedAt;
      result[id] = {
        status,
        ...(typeof note === "string" && note.trim() ? { note: note.trim() } : {}),
        ...(typeof updatedAt === "string" ? { updatedAt } : {}),
      };
    }
    return result;
  } catch {
    return {};
  }
}

/** Реестр с наложенным состоянием — чистая функция, проверяется прогоном. */
export function backlinkTargetsWithStatus(status: BacklinkStatusMap): BacklinkTargetState[] {
  return BACKLINK_TARGETS.map((target) => ({
    ...target,
    status: status[target.id]?.status ?? "pending",
    note: status[target.id]?.note ?? null,
    updatedAt: status[target.id]?.updatedAt ?? null,
  }));
}

/** Шаги человека, которые ещё не сделаны и не отклонены. */
export function pendingHumanTargets(status: BacklinkStatusMap): BacklinkTargetState[] {
  return backlinkTargetsWithStatus(status).filter(
    (target) => target.route === "human" && target.status === "pending",
  );
}

/** Площадки, где ссылку ставит сам агент — уже сегодня, своим выпуском. */
export function automatedBacklinkTargets(): readonly BacklinkTarget[] {
  return BACKLINK_TARGETS.filter((target) => target.route !== "human");
}
