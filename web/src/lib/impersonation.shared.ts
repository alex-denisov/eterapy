/**
 * Имена куков имперсонации, годные и клиенту, и серверу.
 *
 * Отдельный файл нужен по той же причине, что и всегда в этом проекте: клиентский
 * компонент не должен value-импортировать серверный модуль. `impersonation.ts`
 * тянет `next/headers` и JWT-кодек — импорт оттуда из плашки утащил бы серверный
 * код в браузерный бандл (`next build` ловит это, jest и tsc — нет).
 */

/** Подписанный httpOnly-кук: в нём полномочия. */
export const IMPERSONATION_COOKIE = "eterapy-imp";

/** Видимая метка для оформления. Ничего не разрешает — см. `impersonation.ts`. */
export const IMPERSONATION_MARKER_COOKIE = "eterapy-imp-on";
