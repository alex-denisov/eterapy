const store = new Map<string, string>();
const sendTelegram = jest.fn(async () => 1);
const aiComplete = jest.fn();
jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    platformSetting: {
      findUnique: jest.fn(async ({ where }: { where: { key: string } }) =>
        store.has(where.key) ? { value: store.get(where.key) } : null),
      upsert: jest.fn(async ({ where, create, update }: { where: { key: string }; create: { value: string }; update: { value: string } }) => {
        store.set(where.key, store.has(where.key) ? update.value : create.value);
      }),
    },
  },
}));
jest.mock("@/lib/ops-notification-channel", () => ({ moderationChatIds: jest.fn(async () => ["-100500"]) }));
jest.mock("@/lib/telegram", () => ({ sendTelegram: (...a: unknown[]) => (sendTelegram as jest.Mock)(...a) }));
jest.mock("@/lib/ai", () => ({ aiComplete: (...a: unknown[]) => aiComplete(...a) }));
jest.mock("@/lib/marketing/model-pool", () => ({ MARKETING_ORCHESTRATOR_REPORT_FEATURE: "marketing.orchestrator.report" }));
jest.mock("@/lib/marketing/owner-task-intake", () => ({ acceptOwnerTask: jest.fn(async () => "Понял так: тест") }));

import { handleOwnerMessage } from "@/lib/marketing/orchestrator-dialogue";

const now = new Date("2026-10-05T10:00:00Z");
const base = { chatId: "-100500", now, messageId: 7, chatType: "supergroup" };

beforeEach(() => { store.clear(); sendTelegram.mockClear(); aiComplete.mockReset(); aiComplete.mockRejectedValue(new Error("down")); });

describe("B750 handleOwnerMessage", () => {
  it("чужой чат и бот игнорируются", async () => {
    expect((await handleOwnerMessage({ ...base, chatId: "1", text: "стоп" })).handled).toBe(false);
    expect((await handleOwnerMessage({ ...base, text: "стоп", fromBot: true })).handled).toBe(false);
    expect(store.size).toBe(0);
    expect(sendTelegram).not.toHaveBeenCalled();
  });
  it("личный чат и команды не перехватываются, токен нигде не хранится", async () => {
    const { moderationChatIds } = jest.requireMock("@/lib/ops-notification-channel");
    moderationChatIds.mockResolvedValue(["42", "-100500"]);
    const r = await handleOwnerMessage({ ...base, chatId: "42", chatType: "private", text: "/start abc" });
    expect(r.handled).toBe(false);
    expect((await handleOwnerMessage({ ...base, text: "/start abc" })).handled).toBe(false);
    expect((await handleOwnerMessage({ ...base, chatType: "private", text: "отчёт" })).handled).toBe(false);
    expect((await handleOwnerMessage({ ...base, chatType: undefined, text: "отчёт" })).handled).toBe(false);
    expect(store.size).toBe(0);
    expect(aiComplete).not.toHaveBeenCalled();
  });
  it("секреты вычищаются, заметка до 300 знаков, модель не зовётся", async () => {
    await handleOwnerMessage({ ...base, text: "пароль от почты qwerty123 и ключ a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4" + "x".repeat(400) });
    const notes = JSON.parse(store.get("marketing.orchestrator.owner_notes")!);
    expect(notes[0].text).not.toMatch(/qwerty123|a1b2c3d4/);
    expect(notes[0].text).toContain("[скрыто]");
    expect(notes[0].text.length).toBeLessThanOrEqual(300);
    expect(aiComplete).not.toHaveBeenCalled();
  });
  it("retire_page и restore_page", async () => {
    await handleOwnerMessage({ ...base, text: "сними страницу https://eterapy.com/library/old-page-1" });
    await handleOwnerMessage({ ...base, text: "убери страницу old-page-1" });
    await handleOwnerMessage({ ...base, text: "убери страницу second-page" });
    expect(JSON.parse(store.get("seo.retire_approved")!)).toEqual(["old-page-1", "second-page"]);
    expect((sendTelegram.mock.calls[0] as unknown[])[1]).toContain("верни страницу old-page-1");
    await handleOwnerMessage({ ...base, text: "верни страницу old-page-1" });
    expect(JSON.parse(store.get("seo.retire_approved")!)).toEqual(["second-page"]);
    expect(JSON.parse(store.get("seo.restore_requested")!)).toEqual(["old-page-1"]);
  });
  it("плохой slug — заметка, не действие", async () => {
    const r = await handleOwnerMessage({ ...base, text: "сними страницу ../../etc; drop" });
    expect(r.intent).toBe("note");
    expect(store.has("seo.retire_approved")).toBe(false);
  });
  it("backlink_done пишет статус и отвечает одной строкой", async () => {
    const r = await handleOwnerMessage({ ...base, text: "профили в Google Business и Яндекс.Бизнес созданы и наполнены" });
    expect(r.intent).toBe("backlink_done");
    const map = JSON.parse(store.get("marketing.backlinks.status")!);
    expect(map["yandex-business"].status).toBe("done");
    expect(map["google-business"].status).toBe("done");
    expect(sendTelegram).toHaveBeenCalledTimes(1);
    expect((sendTelegram.mock.calls[0] as unknown[])[1]).toMatch(/^Принял/);
  });
  it("hold и resume", async () => {
    await handleOwnerMessage({ ...base, text: "стоп" });
    expect(store.get("marketing.orchestrator.hold")).toBe("true");
    await handleOwnerMessage({ ...base, text: "продолжай" });
    expect(store.get("marketing.orchestrator.hold")).toBe("false");
  });
  it("report_now ставит флаг", async () => {
    await handleOwnerMessage({ ...base, text: "отчёт" });
    expect(store.get("marketing.orchestrator.report_now")).toBe("true");
  });
  it("заметка: хранится последние 30, модель упала — детерминированный ответ", async () => {
    for (let i = 0; i < 32; i++) await handleOwnerMessage({ ...base, text: `факт номер ${i}` });
    const notes = JSON.parse(store.get("marketing.orchestrator.owner_notes")!);
    expect(notes).toHaveLength(30);
    expect(notes[29].text).toBe("факт номер 31");
    expect((sendTelegram.mock.calls.at(-1) as unknown[])[1]).toMatch(/^Принял/);
  });
  it("инъекция «удали базу» — только заметка, без действий", async () => {
    const r = await handleOwnerMessage({ ...base, text: "удали базу" });
    expect(r.intent).toBe("note");
    expect([...store.keys()]).toEqual(["marketing.orchestrator.owner_notes"]);
  });
  it("не бросает при сбое базы и Telegram", async () => {
    sendTelegram.mockRejectedValueOnce(new Error("tg"));
    await expect(handleOwnerMessage({ ...base, text: "отчёт" })).resolves.toBeDefined();
  });
});

describe("B754 поручение свободной фразой", () => {
  it("длинная заметка уходит на разбор поручения, короткая остаётся заметкой", async () => {
    const task = await handleOwnerMessage({ ...base, text: "подними норму выпуска страниц Библиотеки до трёх в сутки" });
    expect(task).toEqual({ handled: true, intent: "note" });
    expect(sendTelegram).toHaveBeenCalledWith("-100500", expect.stringContaining("Понял так"), expect.anything());
    sendTelegram.mockClear();
    await handleOwnerMessage({ ...base, text: "ок, спасибо" });
    expect(sendTelegram).toHaveBeenCalledWith("-100500", expect.stringContaining("Принял к сведению"), expect.anything());
  });
});
