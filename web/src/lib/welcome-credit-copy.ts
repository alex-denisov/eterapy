/**
 * B760 — число подарочных баллов для текстов интерфейса. Отдельный модуль без
 * серверных импортов: клиентские страницы не должны тянуть `welcome-credits.ts`
 * (база, антифрод). Значение держит в согласии с `WELCOME_CREDIT_AMOUNT`
 * тест `b760-auth-return.test.ts`.
 */
export const WELCOME_CREDIT_AMOUNT = 3;
