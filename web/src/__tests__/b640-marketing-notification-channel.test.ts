/**
 * B640 — маркетинговые уведомления (SEO/GEO/SMM/ответы клиентам) уходят в
 * отдельный канал владельца, а не в деплой-канал.
 *
 * Отдельно проверяется приём решения премодерации: карточки, отправленные ДО
 * переезда, остались в служебном канале, и кнопки под ними обязаны работать —
 * иначе переезд во второй раз даёт молча мёртвую кнопку (INC-097).
 */

import {
  configuredMarketingChatId,
  moderationChatIds,
  resolveMarketingChannel,
} from "@/lib/ops-notification-channel";

jest.mock("@/lib/db", () => ({
  db: { user: { findMany: jest.fn().mockResolvedValue([]) } },
  __esModule: true,
  default: { user: { findMany: jest.fn().mockResolvedValue([]) } },
}));

const MARKETING = "-1004495169327";
const OPS = "-1003745526235";

describe("B640: адрес маркетинговых уведомлений", () => {
  it("маркетинговый канал выигрывает у деплой-канала", async () => {
    const channel = await resolveMarketingChannel({
      TELEGRAM_ETERAPY_MARKETING_CHAT_ID: MARKETING,
      TELEGRAM_CHAT_ID: OPS,
    });
    expect(channel.chatIds).toEqual([MARKETING]);
    expect(channel.source).toBe("marketing_channel");
  });

  it("без маркетингового канала доставка не пропадает, а идёт прежним путём", async () => {
    const channel = await resolveMarketingChannel({ TELEGRAM_CHAT_ID: OPS });
    expect(channel.chatIds).toEqual([OPS]);
    expect(channel.source).toBe("ops_channel");
  });

  it("пустая строка не считается настроенным каналом", () => {
    expect(configuredMarketingChatId({ TELEGRAM_ETERAPY_MARKETING_CHAT_ID: "   " })).toBeNull();
  });

  it("решение премодерации принимается и из нового канала, и из старого", async () => {
    const allowed = await moderationChatIds({
      TELEGRAM_ETERAPY_MARKETING_CHAT_ID: MARKETING,
      TELEGRAM_CHAT_ID: OPS,
    });
    expect(allowed).toContain(MARKETING);
    expect(allowed).toContain(OPS);
  });

  it("список чатов премодерации без дублей, когда адрес один и тот же", async () => {
    const allowed = await moderationChatIds({
      TELEGRAM_ETERAPY_MARKETING_CHAT_ID: OPS,
      TELEGRAM_CHAT_ID: OPS,
    });
    expect(allowed).toEqual([OPS]);
  });
});
