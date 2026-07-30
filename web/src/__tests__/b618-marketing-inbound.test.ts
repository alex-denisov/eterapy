/**
 * B618 — контур входящего.
 *
 * Проверяется то, что ломается молча: дедупликация повторной доставки webhook,
 * запрет второго ответа на одно входящее, кризисная маршрутизация к человеку и
 * сторож зависших сообщений (INC-094 — состояние без исполнителя живёт вечно).
 */

type InboundRow = {
  id: string;
  platform: string;
  kind: string;
  externalId: string;
  threadId: string | null;
  authorLabel: string | null;
  text: string;
  permalink: string | null;
  status: string;
  harmScore: number | null;
  receivedAt: Date;
  answeredAt: Date | null;
  lastError: string | null;
};

const inbound: InboundRow[] = [];
const publications: Array<Record<string, unknown>> = [];
const settings = new Map<string, string>();
const sentTelegram: string[] = [];
const signals: Array<Record<string, unknown>> = [];

type InboundWhere = {
  id?: string;
  status?: string | { in?: string[] };
  reply?: null;
  receivedAt?: { lt?: Date };
  platform_externalId?: { platform: string; externalId: string };
};
type Args = {
  where?: InboundWhere & { key?: string };
  data?: Record<string, unknown>;
  create?: { value?: string };
  update?: { value?: string };
};

jest.mock("@/lib/db", () => {
  const matches = (row: InboundRow, where: InboundWhere) => {
    if (where.id && row.id !== where.id) return false;
    if (typeof where.status === "string" && row.status !== where.status) return false;
    if (typeof where.status === "object" && where.status?.in && !where.status.in.includes(row.status)) {
      return false;
    }
    if (where.reply === null && publications.some((item) => item.inboundReplyToId === row.id)) return false;
    if (where.receivedAt?.lt && !(row.receivedAt < where.receivedAt.lt)) return false;
    return true;
  };
  const db = {
    marketingInboundMessage: {
      findUnique: async ({ where }: Args) => {
        const key = where?.platform_externalId;
        if (!key) return null;
        return inbound.find((row) => row.platform === key.platform && row.externalId === key.externalId) ?? null;
      },
      create: async ({ data }: Args) => {
        const row = {
          id: `in-${inbound.length + 1}`,
          threadId: null,
          authorLabel: null,
          permalink: null,
          status: "RECEIVED",
          harmScore: null,
          receivedAt: new Date(),
          answeredAt: null,
          lastError: null,
          ...data,
        } as InboundRow;
        inbound.push(row);
        return row;
      },
      update: async ({ where, data }: Args) => {
        const row = inbound.find((item) => item.id === where?.id)!;
        Object.assign(row, data);
        return row;
      },
      updateMany: async ({ where, data }: Args) => {
        const rows = inbound.filter((row) => matches(row, where ?? {}));
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      },
      findMany: async ({ where }: Args) => inbound.filter((row) => matches(row, where ?? {})),
    },
    externalPublication: {
      create: async ({ data }: Args) => {
        if (publications.some((row) => row.key === data?.key)) {
          throw new Error("Unique constraint failed on the fields: (`key`)");
        }
        publications.push(data ?? {});
        return data;
      },
      findMany: async () => [],
    },
    platformSetting: {
      findUnique: async ({ where }: Args) => (where?.key && settings.has(where.key)
        ? { key: where.key, value: settings.get(where.key) }
        : null),
      upsert: async ({ where, create, update }: Args) => {
        const key = where?.key as string;
        settings.set(key, (update?.value ?? create?.value ?? "") as string);
        return { key, value: settings.get(key) };
      },
    },
  };
  return { __esModule: true, db, default: db };
});

jest.mock("@/lib/telegram", () => ({
  sendTelegram: jest.fn(async (_chatId: string, message: string) => {
    sentTelegram.push(message);
    return 1;
  }),
  callTelegramApi: jest.fn(),
}));

jest.mock("@/lib/ops-notification-channel", () => ({
  resolveOpsChannel: async () => ({ chatIds: ["-100500"], source: "test" }),
}));

jest.mock("@/lib/marketing/agent", () => ({
  upsertMarketingSignal: jest.fn(async (signal: Record<string, unknown>) => {
    signals.push(signal);
    return signal;
  }),
  resolveMarketingSignal: jest.fn(async () => ({ count: 0 })),
}));

jest.mock("@/lib/marketing/platform-settings", () => ({
  marketingPlatformEnabled: async () => false,
  marketingPlatformValue: async () => null,
}));

jest.mock("@/lib/marketing/reddit-oauth", () => ({
  redditAccessToken: async () => "token",
}));

import {
  auditUnansweredInbound,
  ingestInboundMessage,
  markInboundAnswered,
  normalizeInboundText,
  queueInboundReplies,
} from "@/lib/marketing/inbound";
import { parseMetaInboundEvents } from "@/lib/marketing/meta-webhooks";
import { INBOUND_REPLY_CONTENT_TYPE } from "@/lib/marketing/perimeter";

beforeEach(() => {
  inbound.length = 0;
  publications.length = 0;
  settings.clear();
  sentTelegram.length = 0;
  signals.length = 0;
});

describe("B618 · дедупликация входящего", () => {
  it("повторная доставка того же webhook не создаёт второе входящее", async () => {
    const first = await ingestInboundMessage({
      platform: "instagram",
      kind: "COMMENT",
      externalId: "comment-1",
      text: "А по дате рождения это работает?",
    });
    const second = await ingestInboundMessage({
      platform: "instagram",
      kind: "COMMENT",
      externalId: "comment-1",
      text: "А по дате рождения это работает?",
    });

    expect(first?.created).toBe(true);
    expect(second?.created).toBe(false);
    expect(inbound).toHaveLength(1);
  });

  it("повторная доставка не возвращает отвеченное входящее в работу", async () => {
    await ingestInboundMessage({
      platform: "vk",
      kind: "COMMENT",
      externalId: "77",
      text: "Спасибо, помогло",
    });
    await markInboundAnswered(inbound[0].id);
    await ingestInboundMessage({
      platform: "vk",
      kind: "COMMENT",
      externalId: "77",
      text: "Спасибо, помогло!",
    });

    expect(inbound[0].status).toBe("ANSWERED");
  });

  it("пустой текст и пустой идентификатор в очередь не попадают", async () => {
    expect(await ingestInboundMessage({
      platform: "vk", kind: "COMMENT", externalId: "1", text: "   ",
    })).toBeNull();
    expect(await ingestInboundMessage({
      platform: "vk", kind: "COMMENT", externalId: " ", text: "текст",
    })).toBeNull();
    expect(inbound).toHaveLength(0);
  });

  it("текст нормализуется и обрезается по границе хранения", () => {
    expect(normalizeInboundText("  два\n\nпробела  ")).toBe("два пробела");
    expect(normalizeInboundText("я".repeat(2_000))).toHaveLength(1_200);
  });
});

describe("B618 · один ответ на одно входящее", () => {
  it("на новое входящее заводится ответ через премодерационный конвейер", async () => {
    await ingestInboundMessage({
      platform: "threads",
      kind: "COMMENT",
      externalId: "t-1",
      threadId: "media-1",
      authorLabel: "@user",
      text: "А чем это отличается от гадания на картах?",
    });

    const result = await queueInboundReplies({ now: new Date("2026-07-30T10:00:00Z") });

    expect(result).toMatchObject({ considered: 1, drafted: 1, escalated: 0 });
    expect(publications).toHaveLength(1);
    expect(publications[0]).toMatchObject({
      contentType: INBOUND_REPLY_CONTENT_TYPE,
      status: "DRAFT",
      autoPublish: false,
      platform: "threads",
    });
    expect(inbound[0].status).toBe("DRAFTED");
  });

  it("гонка двух нод не создаёт второй ответ: ключ занят — входящее считается взятым", async () => {
    await ingestInboundMessage({
      platform: "threads", kind: "COMMENT", externalId: "t-2", text: "Вопрос по срокам",
    });
    // Первый проход занял ключ ответа; второй воркер приходит на ту же строку.
    await queueInboundReplies({});
    expect(publications).toHaveLength(1);
    const takenKey = publications[0].key as string;

    publications.length = 0;
    publications.push({ key: takenKey, inboundReplyToId: "other" });
    inbound[0].status = "RECEIVED";
    await queueInboundReplies({});

    expect(publications).toHaveLength(1);
    expect(inbound[0].status).toBe("DRAFTED");
  });
});

describe("B618 · кризис отвечает человек, а не регистр", () => {
  it("явная угроза себе уходит человеку и не получает автоответа", async () => {
    await ingestInboundMessage({
      platform: "vk",
      kind: "DIRECT",
      externalId: "m-9",
      text: "я не хочу жить, всё уже решил",
    });

    const result = await queueInboundReplies({});

    expect(result).toMatchObject({ escalated: 1, drafted: 0 });
    expect(inbound[0].status).toBe("ESCALATED");
    expect(publications).toHaveLength(0);
    expect(sentTelegram.join("\n")).toContain("требует человека");
  });

  it("фигуральная речь кризисом не считается и получает обычный ответ", async () => {
    await ingestInboundMessage({
      platform: "vk",
      kind: "COMMENT",
      externalId: "m-10",
      text: "эта работа меня убивает, но увольняться страшно",
    });

    const result = await queueInboundReplies({});

    expect(result).toMatchObject({ escalated: 0, drafted: 1 });
    expect(inbound[0].status).toBe("DRAFTED");
  });
});

describe("B618 · сторож зависших входящих", () => {
  const now = new Date("2026-07-30T12:00:00Z");

  it("молчание дольше суток поднимает сигнал и сообщение в Telegram", async () => {
    await ingestInboundMessage({
      platform: "vk", kind: "COMMENT", externalId: "old-1", text: "Есть вопрос",
    });
    inbound[0].receivedAt = new Date("2026-07-28T12:00:00Z");

    const result = await auditUnansweredInbound({ now });

    expect(result.stale).toHaveLength(1);
    expect(result.notified).toBe(true);
    expect(signals[0]).toMatchObject({ key: "inbound:stalled", severity: "WARNING" });
  });

  it("повторный прогон в том же окне не будит второй раз", async () => {
    await ingestInboundMessage({
      platform: "vk", kind: "COMMENT", externalId: "old-2", text: "Есть вопрос",
    });
    inbound[0].receivedAt = new Date("2026-07-28T12:00:00Z");

    await auditUnansweredInbound({ now });
    const second = await auditUnansweredInbound({ now: new Date("2026-07-30T13:00:00Z") });

    expect(second.stale).toHaveLength(1);
    expect(second.notified).toBe(false);
    expect(sentTelegram.filter((message) => message.includes("Входящие без ответа"))).toHaveLength(1);
  });

  it("отвеченное входящее сторожа не беспокоит", async () => {
    await ingestInboundMessage({
      platform: "vk", kind: "COMMENT", externalId: "old-3", text: "Есть вопрос",
    });
    inbound[0].receivedAt = new Date("2026-07-28T12:00:00Z");
    await markInboundAnswered(inbound[0].id, now);

    const result = await auditUnansweredInbound({ now });

    expect(result.stale).toHaveLength(0);
    expect(result.notified).toBe(false);
  });
});

describe("B618 · разбор полезной нагрузки Meta", () => {
  it("комментарий к нашей публикации превращается во входящее", () => {
    const events = parseMetaInboundEvents({
      entry: [{
        id: "media-1",
        changes: [{
          field: "comments",
          value: {
            id: "c-1",
            text: "А по дате рождения работает?",
            from: { id: "u-1", username: "reader" },
            media: { id: "media-1" },
            permalink: "https://www.instagram.com/p/abc/c/1",
          },
        }],
      }],
    }, "self-1");

    expect(events).toEqual([{
      kind: "COMMENT",
      externalId: "c-1",
      threadId: "media-1",
      authorLabel: "@reader",
      text: "А по дате рождения работает?",
      permalink: "https://www.instagram.com/p/abc/c/1",
    }]);
  });

  it("наш собственный комментарий отбрасывается — агент не отвечает себе", () => {
    const events = parseMetaInboundEvents({
      entry: [{
        id: "media-1",
        changes: [{
          field: "comments",
          value: { id: "c-2", text: "Наш ответ", from: { id: "self-1" } },
        }],
      }],
    }, "self-1");

    expect(events).toHaveLength(0);
  });

  it("упоминание опознаётся отдельным типом", () => {
    const events = parseMetaInboundEvents({
      entry: [{
        changes: [{
          field: "mentions",
          value: { id: "m-1", text: "@eterapy что скажете?", username: "author" },
        }],
      }],
    }, null);

    expect(events[0]).toMatchObject({ kind: "MENTION", authorLabel: "@author" });
  });

  it("посторонние поля webhook игнорируются", () => {
    expect(parseMetaInboundEvents({ entry: [{ changes: [{ field: "story_insights", value: { id: "x" } }] }] }, null))
      .toHaveLength(0);
    expect(parseMetaInboundEvents(null, null)).toHaveLength(0);
  });
});
