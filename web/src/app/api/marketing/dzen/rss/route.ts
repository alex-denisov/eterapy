/**
 * B620 · GET /api/marketing/dzen/rss — размеченная лента для канала Дзена.
 *
 * Адрес публичный: ленту забирает робот площадки, авторизации у него нет.
 * Наружу уходят только уже одобренные и выпущенные материалы, то есть ровно то,
 * что и так публично.
 */

import { log } from "@/lib/logger";
import {
  buildDzenFeed,
  dzenFeedItems,
} from "@/lib/marketing/dzen-feed";
import { marketingPlatformValue } from "@/lib/marketing/platform-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const channelUrl = await marketingPlatformValue("DZEN_CHANNEL_URL").catch(() => null);
  const items = await dzenFeedItems();
  const feed = buildDzenFeed({
    items,
    channelUrl: channelUrl?.trim() || "https://eterapy.com/",
  });
  log.info("marketing.dzen_feed_served", { items: items.length });
  return new Response(feed, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      // Лента меняется несколько раз в сутки; получасовой кеш снимает нагрузку
      // и не задерживает материал заметно.
      "Cache-Control": "public, max-age=1800",
    },
  });
}
