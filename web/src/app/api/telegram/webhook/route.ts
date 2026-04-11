/**
 * POST /api/telegram/webhook
 * Webhook для Telegram-бота. Принимает обновления от Telegram.
 *
 * Команды:
 * /start <token> — привязывает telegramId к аккаунту пользователя
 * /start         — показывает инструкцию по привязке
 * /stop          — отвязывает Telegram-аккаунт
 * /status        — проверяет статус привязки
 */
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { sendTelegram } from "@/lib/telegram";

const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";

/** Безопасная отправка — не кидает ошибку, логирует при неудаче */
async function safeSend(chatId: string, text: string) {
  try {
    await sendTelegram(chatId, text);
  } catch (err) {
    console.error("[telegram webhook] sendTelegram failed:", err);
  }
}

export async function POST(req: NextRequest) {
  try {
    // Protect with secret token if configured
    const secret = req.headers.get("x-telegram-bot-api-secret-token");
    if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
      console.warn("[telegram webhook] Unauthorized — secret mismatch");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let update: TelegramUpdate;
    try {
      update = await req.json();
    } catch {
      console.warn("[telegram webhook] Invalid JSON body");
      return NextResponse.json({ ok: false });
    }

    const msg = update.message;
    if (!msg || !msg.text) return NextResponse.json({ ok: true });

    const chatId = String(msg.chat.id);
    const username = msg.from?.username ?? null;
    const text = msg.text.trim();

    console.log(`[telegram webhook] /${text.split(" ")[0]} from chatId=${chatId}`);

    if (text.startsWith("/start")) {
      const token = text.split(" ")[1]?.trim();

      if (!token) {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://eterapy.com";
        await safeSend(chatId,
          `👋 Добро пожаловать в ETerapy!\n\nЧтобы получать уведомления, привяжите Telegram к своему аккаунту:\n\n1. Войдите на <a href="${baseUrl}">ETerapy</a>\n2. Перейдите в Настройки → Уведомления\n3. Нажмите Привязать Telegram`
        );
        return NextResponse.json({ ok: true });
      }

      // Verify token from DB
      const link = await db.telegramLinkToken.findUnique({ where: { token } });
      if (!link || link.expiresAt < new Date()) {
        await safeSend(chatId, "❌ Ссылка устарела или неверна. Сгенерируйте новую в настройках аккаунта.");
        return NextResponse.json({ ok: true });
      }

      // Check if this Telegram is already linked to someone else
      const existing = await db.user.findFirst({ where: { telegramId: chatId } });
      if (existing && existing.id !== link.userId) {
        await safeSend(chatId, "⚠️ Этот Telegram уже привязан к другому аккаунту ETerapy.");
        return NextResponse.json({ ok: true });
      }

      // Link
      await db.$transaction([
        db.user.update({
          where: { id: link.userId },
          data: { telegramId: chatId, telegramUsername: username },
        }),
        db.telegramLinkToken.delete({ where: { token } }),
      ]);

      const user = await db.user.findUnique({ where: { id: link.userId }, select: { name: true } });
      console.log(`[telegram webhook] Linked chatId=${chatId} to userId=${link.userId} (${user?.name})`);
      await safeSend(chatId,
        `✅ Telegram привязан!\nПривет, ${user?.name ?? ""}! Теперь вы будете получать уведомления ETerapy через Telegram.`
      );
      return NextResponse.json({ ok: true });
    }

    if (text === "/stop") {
      const user = await db.user.findFirst({ where: { telegramId: chatId } });
      if (!user) {
        await safeSend(chatId, "Ваш Telegram не привязан ни к одному аккаунту ETerapy.");
      } else {
        await db.user.update({ where: { id: user.id }, data: { telegramId: null, telegramUsername: null } });
        console.log(`[telegram webhook] Unlinked chatId=${chatId} from userId=${user.id}`);
        await safeSend(chatId, "✅ Telegram отвязан от аккаунта ETerapy. Уведомления отключены.");
      }
      return NextResponse.json({ ok: true });
    }

    if (text === "/status") {
      const user = await db.user.findFirst({ where: { telegramId: chatId }, select: { name: true, email: true } });
      if (!user) {
        await safeSend(chatId, "❌ Telegram не привязан к аккаунту ETerapy.");
      } else {
        await safeSend(chatId, `✅ Привязан к аккаунту: ${user.name} (${user.email})`);
      }
      return NextResponse.json({ ok: true });
    }

    // Unknown command
    await safeSend(chatId, "Доступные команды:\n/start — начало работы\n/status — статус привязки\n/stop — отвязать аккаунт");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[telegram webhook] Unhandled error:", err);
    // Always return 200 — Telegram will retry on 5xx
    return NextResponse.json({ ok: true });
  }
}

interface TelegramUpdate {
  message?: {
    text?: string;
    chat: { id: number };
    from?: { username?: string };
  };
}
