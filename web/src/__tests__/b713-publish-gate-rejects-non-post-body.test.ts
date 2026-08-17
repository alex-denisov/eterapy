/**
 * B713 §1 — рубеж перед отправкой на площадку.
 *
 * ПОЧЕМУ ЭТОТ ПРОГОН СУЩЕСТВУЕТ. 17.08 в брендовый Telegram ушёл лог
 * рассуждений модели (`t.me/eterapy/19`). Страж B705 `rejectNonPostWriterOutput`
 * к тому моменту БЫЛ на проде — и поймать это не мог в принципе:
 *
 *   материал одобрен редактором   16.08 01:04 UTC
 *   контейнер со стражем поднят   16.08 12:43 UTC
 *   ушёл в канал                  17.08 05:30 UTC
 *
 * Страж стоит на разборе ответа автора (`writerObject`). Всё, что уже лежит в
 * `body` со статусом SCHEDULED, он не видит никогда. То есть любой текст,
 * одобренный до появления любого будущего правила, выходит наружу в обход
 * этого правила — и так будет с каждым следующим правилом, а не только с этим.
 *
 * Рубеж поэтому ставится на ГРАНИЦЕ НАРУЖУ, где он проверяет то, что реально
 * уйдёт на площадку, а не то, что когда-то вернула модель.
 *
 * ⚠ ОТКАЗ РУБЕЖА — НЕ БРАК МАТЕРИАЛА. Тема и план ни при чём: виноват текст,
 * который написала модель. Поэтому строка возвращается на склад (`DRAFT`), а не
 * в `FAILED`, и попытка публикации ей не засчитывается — иначе два таких
 * отказа сжигали бы лимит попыток и хоронили материал за чужую вину (B695).
 */

import { publishScheduledMarketing } from "@/lib/marketing/publish";

const publicationFindMany = jest.fn();
const publicationUpdate = jest.fn();
const publicationUpdateMany = jest.fn().mockResolvedValue({ count: 1 });

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    externalPublication: {
      findMany: (...args: unknown[]) => publicationFindMany(...args),
      update: (...args: unknown[]) => publicationUpdate(...args),
      updateMany: (...args: unknown[]) => publicationUpdateMany(...args),
      count: jest.fn().mockResolvedValue(0),
    },
    platformSetting: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    marketingAutomationSignal: {
      upsert: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  },
}));

jest.mock("@/lib/marketing/platform-settings", () => ({
  __esModule: true,
  marketingPlatformEnabled: jest.fn().mockResolvedValue(true),
  marketingPlatformValue: jest.fn().mockResolvedValue("value"),
  requiredMarketingPlatformValue: jest.fn().mockResolvedValue("value"),
}));

jest.mock("@/lib/marketing/publish-notification", () => ({
  __esModule: true,
  notifyPublished: jest.fn().mockResolvedValue(true),
}));

function row(id: string, body: string) {
  return {
    id,
    key: `key-${id}`,
    title: "Заголовок материала",
    body,
    platform: "telegram",
    contentType: "POST",
    mediaUrl: null,
    channelName: null,
    destinationUrl: null,
    cluster: null,
    targetQuery: null,
    notes: null,
    engagementTargetId: null,
    engagementTargetUrl: null,
    engagementTargetLabel: null,
    engagementExcerpt: null,
    engagementTone: null,
    inboundReplyToId: null,
    inboundReplyTo: null,
  };
}

/** Тело утёкшего поста `t.me/eterapy/19`, сокращённое до сути. */
const LEAKED_BODY = [
  "<think>",
  "The user wants me to revise a Telegram post based on specific editor feedback.",
  "Task:",
  "- Platform: Telegram",
  "- Max characters: 900 (total including link and CTA)",
  "Editor Issues:",
  " 1. No word CTA.",
  " 2. Text is 5222 chars, limit is 900.",
].join("\n");

const CLEAN_BODY = "Сегодняшний символ — перекрёсток. Он не обещает верного поворота, "
  + "но напоминает: выбор уже перед вами, и отложить его тоже выбор. "
  + "Посмотрите, какое из направлений вы обходите взглядом — обычно там и лежит ответ.";

beforeEach(() => {
  jest.clearAllMocks();
  publicationUpdateMany.mockResolvedValue({ count: 1 });
});

describe("B713 — рубеж перед отправкой на площадку", () => {
  it("не отдаёт адаптеру тело с логом рассуждений", async () => {
    publicationFindMany.mockResolvedValue([row("leaked", LEAKED_BODY)]);
    const telegram = jest.fn();

    const result = await publishScheduledMarketing({
      now: new Date("2026-08-17T05:30:00Z"),
      adapters: { telegram },
    });

    expect(telegram).not.toHaveBeenCalled();
    expect(result.published).toBe(0);
  });

  it("возвращает строку на склад, а не признаёт браком", async () => {
    publicationFindMany.mockResolvedValue([row("leaked", LEAKED_BODY)]);

    await publishScheduledMarketing({
      now: new Date("2026-08-17T05:30:00Z"),
      adapters: { telegram: jest.fn() },
    });

    const returned = publicationUpdateMany.mock.calls
      .map(([args]) => args as { data?: { status?: string; attemptCount?: unknown } })
      .find((args) => args?.data?.status === "DRAFT");

    expect(returned).toBeDefined();
    // Попытка публикации не засчитывается: виноват текст модели, не материал.
    expect(returned?.data?.attemptCount).toBeUndefined();
  });

  it("называет причину так, чтобы её было видно в журнале", async () => {
    publicationFindMany.mockResolvedValue([row("leaked", LEAKED_BODY)]);

    await publishScheduledMarketing({
      now: new Date("2026-08-17T05:30:00Z"),
      adapters: { telegram: jest.fn() },
    });

    const returned = publicationUpdateMany.mock.calls
      .map(([args]) => args as { data?: { status?: string; lastError?: string } })
      .find((args) => args?.data?.status === "DRAFT");

    expect(returned?.data?.lastError).toContain("рассужден");
  });

  it("готовый пост выпускает как прежде", async () => {
    publicationFindMany.mockResolvedValue([row("clean", CLEAN_BODY)]);
    const telegram = jest.fn().mockResolvedValue({
      externalPostId: "42",
      publicUrl: "https://t.me/eterapy/42",
    });

    const result = await publishScheduledMarketing({
      now: new Date("2026-08-17T05:30:00Z"),
      adapters: { telegram },
    });

    expect(telegram).toHaveBeenCalledTimes(1);
    expect(result.published).toBe(1);
  });
});
