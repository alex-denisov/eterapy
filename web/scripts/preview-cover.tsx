/**
 * B731 — отрисовать обложку в файл и ПОСМОТРЕТЬ ГЛАЗАМИ, не поднимая базу.
 *
 * Мокап переписки принимается владельцем по картинке, а не по коду, и правится
 * итерациями: без быстрого прогона каждая правка стоила бы выкатки на стенд.
 * Satori к тому же ломается тише, чем jest, — часть ошибок видна только на
 * отрисованном PNG.
 *
 *   npx tsx scripts/preview-cover.tsx --platform=telegram --layout=chat_mockup \
 *     --message="Ты стала какой-то чужой" --out=/tmp/cover.png
 */

import { writeFile } from "node:fs/promises";
import { ImageResponse } from "next/og";
import { CoverArt, coverCanvas } from "@/lib/marketing/cover-art";
import { ogFonts } from "@/lib/marketing/cover-fonts";
import { ogEmoji } from "@/lib/marketing/cover-emoji";
import type { ChatTopic } from "@/lib/marketing/chat-thread";

function arg(name: string, fallback: string): string {
  const found = process.argv.find((item) => item.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
}

async function main() {
  const platform = arg("platform", "telegram");
  const layout = arg("layout", "chat_mockup") as "art" | "chat_mockup";
  const canvas = coverCanvas(platform);
  const fonts = layout === "chat_mockup" ? await ogFonts() : [];
  const emoji = layout === "chat_mockup" ? await ogEmoji() : undefined;

  const response = new ImageResponse(
    (
      <CoverArt
        slotKey={arg("key", "b610-2w-telegram-20260908-01")}
        platform={platform}
        title={arg("title", "Почему он замолчал: разбор переписки")}
        eyebrow={arg("eyebrow", "Отношения")}
        scheduledFor={null}
        layout={layout}
        messageText={arg("message", "Ты стала какой-то чужой, я не понимаю, что происходит")}
        responsePreview={arg("response", "") || undefined}
        topic={(arg("topic", "") || undefined) as ChatTopic | undefined}
        framing={(arg("framing", "") || undefined) as "full" | "cropped" | undefined}
        emoji={emoji}
      />
    ),
    { width: canvas.width, height: canvas.height, ...(fonts.length > 0 ? { fonts } : {}) },
  );

  const out = arg("out", "/tmp/cover.png");
  await writeFile(out, Buffer.from(await response.arrayBuffer()));
  console.log(`${out} — ${canvas.width}×${canvas.height}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
