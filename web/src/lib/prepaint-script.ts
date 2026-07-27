// Всё, что должно случиться ДО первого кадра, едет одной строкой и одним
// <Script beforeInteractive>. Причина не в аккуратности: каждый inline-скрипт
// требует собственного sha256 в CSP (INC-069 — нонс здесь недоступен, см.
// комментарий у хеша в `security-headers.ts`), а второй хеш — это второе место,
// которое забудут обновить.
//
// Порядок важен: mini-app решает, показывать ли хром сайта вообще, и только
// потом имеет смысл подсказка о состоянии шапки.

import { MINIAPP_INLINE_SCRIPT } from "./miniapp";
import { AUTH_HINT_INLINE_SCRIPT } from "./auth-hint";

export const PRE_PAINT_INLINE_SCRIPT = `${MINIAPP_INLINE_SCRIPT}${AUTH_HINT_INLINE_SCRIPT}`;
