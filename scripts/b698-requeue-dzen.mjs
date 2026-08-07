/**
 * B698 — вернуть в очередь то, что «выпущено» лентой, но читателя не видело.
 *
 * ЧТО ИМЕННО ВОЗВРАЩАЕМ. Строка Дзена со статусом PUBLISHED, идентификатором
 * вида `dzen-feed:…` и ПУСТЫМ публичным адресом — это материал, отданный в
 * RSS-ленту. Лента подключается каналу от 10 подписчиков; их нет, значит
 * материал не дошёл ни до одного читателя.
 *
 * ЧЕГО НЕ ТРОГАЕМ. Строки с живым адресом `https://dzen.ru/a/…` — они выпущены
 * (вручную, B683) и читателю доступны. Возвращать их в очередь значило бы
 * выпустить дубль.
 *
 * Черновики (DRAFT) трогать не нужно вовсе: способ выпуска в строке не хранится,
 * он решается конфигурацией в момент выпуска. После входа владельца они уйдут
 * браузером сами.
 *
 * Запуск (сухой прогон по умолчанию):
 *   node scripts/b698-requeue-dzen.mjs
 *   node scripts/b698-requeue-dzen.mjs --apply
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Клиент строится ТАК ЖЕ, как в приложении (`web/src/lib/db.ts`): Prisma 7
 * требует адаптер, и пустой `new PrismaClient()` падает при первом же запуске —
 * скрипт выглядел рабочим ровно до попытки применить его на проде.
 */
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const apply = process.argv.includes("--apply");

const rows = await db.externalPublication.findMany({
  where: {
    platform: { in: ["dzen", "Dzen", "DZEN"] },
    status: "PUBLISHED",
    externalPostId: { startsWith: "dzen-feed:" },
    OR: [{ publicUrl: null }, { publicUrl: "" }],
  },
  select: { id: true, key: true, scheduledFor: true, publishedAt: true },
});

if (rows.length === 0) {
  console.log("Нечего возвращать: строк «отдано в ленту, адреса нет» не найдено.");
} else {
  for (const row of rows) {
    console.log(`${apply ? "возвращаю" : "вернул бы"}: ${row.key} (выпущен ${row.publishedAt?.toISOString() ?? "—"})`);
  }
  if (apply) {
    const result = await db.externalPublication.updateMany({
      where: { id: { in: rows.map((row) => row.id) } },
      data: {
        status: "DRAFT",
        externalPostId: null,
        publishedAt: null,
        // Счётчик попыток обнуляем: прошлая «попытка» была отдачей в ленту, а
        // не выпуском. Оставить её значило бы отнять у материала подход к
        // новому способу (B680, рубеж попыток на материал).
        attemptCount: 0,
        lastError: null,
      },
    });
    console.log(`Возвращено в очередь: ${result.count}`);
  } else {
    console.log("\nСухой прогон. Повторите с --apply, чтобы применить.");
  }
}

await db.$disconnect();
