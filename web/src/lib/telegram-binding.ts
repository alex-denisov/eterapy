/**
 * INC-088: единая привязка Telegram к аккаунту.
 *
 * До этого модуля привязок было ДВЕ, и они не знали друг о друге:
 *
 *   1. `users.telegramId` — адрес доставки уведомлений; пишется ботом по
 *      `/start <token>` из раздела «Уведомления».
 *   2. `platform_identities(provider='telegram', subject_id)` — вход из Mini App
 *      после проверки подписи Telegram (B528).
 *
 * Человек, зашедший через Mini App и связавший аккаунт, в разделе «Уведомления»
 * оставался «не привязан»: identity была, `telegramId` — нет, и ни одно
 * уведомление до него не доходило. Верно и обратное: привязка через бота не
 * открывала вход из Mini App. На проде это развело один Telegram владельца по
 * ТРЁМ аккаунтам сразу (identity на одном, `telegramId` на другом, а нужен был
 * третий).
 *
 * Здесь обе записи пишутся и снимаются вместе, в одной транзакции. Одна учётка —
 * один Telegram, один Telegram — одна учётка: `users.telegramId` уникален, а
 * вход обязан быть однозначным.
 */
import db from "@/lib/db";

export type TelegramBindingInput = {
  userId: string;
  subjectId: string;
  username?: string | null;
  displayName?: string | null;
};

export type TelegramBindingConflict = "IDENTITY_IN_USE" | "USER_HAS_IDENTITY";

export type TelegramBindingResult =
  | { ok: true; subjectId: string }
  | { ok: false; code: TelegramBindingConflict };

/**
 * Привязывает Telegram к аккаунту: identity (вход) и `telegramId` (доставка).
 *
 * `IDENTITY_IN_USE`  — этот Telegram занят другим аккаунтом (любой из двух записей).
 * `USER_HAS_IDENTITY` — у аккаунта уже привязан ДРУГОЙ Telegram.
 * Повторная привязка того же Telegram к тому же аккаунту — успех (идемпотентно).
 */
export async function bindTelegramToUser(input: TelegramBindingInput): Promise<TelegramBindingResult> {
  const { userId, subjectId } = input;
  const username = input.username ?? null;
  const displayName = input.displayName ?? null;

  return db.$transaction(async (tx) => {
    const [identityBySubject, identityByUser, userByTelegramId, user] = await Promise.all([
      tx.platformIdentity.findUnique({ where: { provider_subjectId: { provider: "telegram", subjectId } } }),
      tx.platformIdentity.findUnique({ where: { provider_userId: { provider: "telegram", userId } } }),
      tx.user.findFirst({ where: { telegramId: subjectId }, select: { id: true } }),
      tx.user.findUnique({ where: { id: userId }, select: { id: true, telegramId: true } }),
    ]);

    if (!user) return { ok: false as const, code: "IDENTITY_IN_USE" as const };
    if (identityBySubject && identityBySubject.userId !== userId) return { ok: false as const, code: "IDENTITY_IN_USE" as const };
    if (userByTelegramId && userByTelegramId.id !== userId) return { ok: false as const, code: "IDENTITY_IN_USE" as const };
    if (identityByUser && identityByUser.subjectId !== subjectId) return { ok: false as const, code: "USER_HAS_IDENTITY" as const };
    if (user.telegramId && user.telegramId !== subjectId) return { ok: false as const, code: "USER_HAS_IDENTITY" as const };

    await tx.platformIdentity.upsert({
      where: { provider_subjectId: { provider: "telegram", subjectId } },
      create: { provider: "telegram", subjectId, userId, username, displayName },
      update: { username, displayName, verifiedAt: new Date(), lastSeenAt: new Date() },
    });
    await tx.user.update({
      where: { id: userId },
      data: { telegramId: subjectId, telegramUsername: username },
    });

    return { ok: true as const, subjectId };
  });
}

export type TelegramUnbindResult = {
  unlinked: boolean;
  userId: string;
  subjectId: string | null;
};

/**
 * Снимает обе записи разом. Возвращает `unlinked: false`, если снимать было
 * нечего — вызывающая сторона сама решает, ошибка это или нет.
 */
export async function unbindTelegramFromUser(userId: string): Promise<TelegramUnbindResult> {
  return db.$transaction(async (tx) => {
    const [user, identity] = await Promise.all([
      tx.user.findUnique({ where: { id: userId }, select: { id: true, telegramId: true } }),
      tx.platformIdentity.findUnique({ where: { provider_userId: { provider: "telegram", userId } } }),
    ]);
    const subjectId = user?.telegramId ?? identity?.subjectId ?? null;
    if (!user || (!user.telegramId && !identity)) {
      return { unlinked: false, userId, subjectId };
    }

    if (identity) await tx.platformIdentity.delete({ where: { id: identity.id } });
    if (user.telegramId) {
      await tx.user.update({ where: { id: userId }, data: { telegramId: null, telegramUsername: null } });
    }
    await tx.telegramLinkToken.deleteMany({ where: { userId } });

    return { unlinked: true, userId, subjectId };
  });
}

/**
 * Ищет аккаунт по Telegram-идентификатору, глядя в ОБЕ записи: бот знает только
 * chat_id, а привязка могла прийти из Mini App.
 */
export async function findUserByTelegramSubject(subjectId: string): Promise<{ id: string; name: string | null } | null> {
  const byTelegramId = await db.user.findFirst({ where: { telegramId: subjectId }, select: { id: true, name: true } });
  if (byTelegramId) return byTelegramId;
  const identity = await db.platformIdentity.findUnique({
    where: { provider_subjectId: { provider: "telegram", subjectId } },
    select: { user: { select: { id: true, name: true } } },
  });
  return identity?.user ?? null;
}
