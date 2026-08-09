/**
 * B669 · Отказ почтового провайдера не имеет права выглядеть как отправка.
 *
 * Живой случай, с которого начался тикет: два зарегистрированных пользователя
 * (`yana_35b@mail.ru`, `loskutovaliza736@gmail.com`) не получили письмо
 * подтверждения, а в журнале служебных отправок по ним НОЛЬ строк — ни `sent`,
 * ни `failed`. Причина в SDK: `resend.emails.send()` резолвится и при отказе,
 * возвращая `{ data: null, error }`. Наша обёртка считала резолв успехом.
 */

import fs from "node:fs";
import path from "node:path";

const send = jest.fn();

jest.mock("resend", () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send } })),
}));

const recorded: Array<{ status: string; error: string | null; event: string }> = [];
jest.mock("@/lib/notifications/dispatch-log", () => ({
  withAccountEmailLog: async (
    input: { event: string },
    fn: () => Promise<unknown>,
  ) => {
    try {
      const result = await fn();
      recorded.push({ status: "sent", error: null, event: input.event });
      return result;
    } catch (error) {
      recorded.push({
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        event: input.event,
      });
      throw error;
    }
  },
}));

describe("B669 — правда об отправке письма", () => {
  beforeEach(() => {
    jest.resetModules();
    send.mockReset();
    recorded.length = 0;
    process.env.RESEND_API_KEY = "re_test_key";
  });

  it("отказ провайдера превращается в исключение, а не в тихий успех", async () => {
    send.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: "The domain is not verified" },
    });
    const { sendVerificationEmail } = await import("@/lib/email");

    await expect(
      sendVerificationEmail("yana_35b@mail.ru", "Яна", "tok"),
    ).rejects.toThrow(/не верифицирован|not verified/i);
  });

  it("тот же отказ пишется в журнал как failed с текстом причины", async () => {
    send.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: "The domain is not verified" },
    });
    const { sendVerificationEmail } = await import("@/lib/email");

    await sendVerificationEmail("loskutovaliza736@gmail.com", "Лиза", "tok").catch(() => {});

    expect(recorded).toHaveLength(1);
    expect(recorded[0].status).toBe("failed");
    expect(recorded[0].event).toBe("ACCOUNT_EMAIL_VERIFY");
    expect(recorded[0].error).toContain("not verified");
  });

  it("успешная отправка по-прежнему пишется как sent и возвращает id", async () => {
    send.mockResolvedValue({ data: { id: "abc" }, error: null });
    const { sendVerificationEmail } = await import("@/lib/email");

    const result = await sendVerificationEmail("client@test.eterapy.com", "Клиент", "tok");

    expect(recorded[0].status).toBe("sent");
    expect((result as { data: { id: string } }).data.id).toBe("abc");
  });

  it("отправка идёт через одну точку — ни один файл не зовёт SDK напрямую", () => {
    const root = path.join(__dirname, "..");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "__tests__" || entry.name === "node_modules") continue;
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name)) continue;
        const src = fs.readFileSync(full, "utf8");
        // Единственное законное место вызова SDK — определение sendViaResend.
        if (src.includes("emails.send(") && !full.endsWith(path.join("lib", "email.ts"))) {
          offenders.push(path.relative(root, full));
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
