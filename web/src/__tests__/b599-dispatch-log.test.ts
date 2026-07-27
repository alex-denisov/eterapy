/**
 * B599 (батч №20) · Журнал служебных отправок.
 *
 * Владелец: «я хочу в этом разделе посмотреть кому отправлены уведомления
 * (системные, маркетинговые и др), когда, что именно было в этом уведомлении».
 *
 * Здесь проверяется то, что дороже всего стоило бы ошибки:
 *   — тело письма сброса пароля НЕ сохраняется (в нём рабочая одноразовая
 *     ссылка, а журнал читает суперадмин);
 *   — падение журнала не срывает доставку (иначе человек получил бы второе
 *     письмо из-за проблемы в нашей бухгалтерии);
 *   — срок отмены удаления аккаунта — ОДНО число на весь код, а не три разных,
 *     как было до этого батча.
 */

import {
  ACCOUNT_SOFT_DELETE_GRACE_DAYS,
  accountPurgeDate,
} from "@/lib/account-deletion-policy";

const create = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  db: { notificationDispatch: { create } },
  default: { notificationDispatch: { create } },
}));

jest.mock("@/lib/logger", () => ({
  __esModule: true,
  log: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

import { recordNotificationDispatch, withAccountEmailLog } from "@/lib/notifications/dispatch-log";

describe("B599 · журнал служебных отправок", () => {
  beforeEach(() => {
    create.mockReset();
    create.mockResolvedValue({});
  });

  it("служебное уведомление сохраняется вместе с телом", async () => {
    await recordNotificationDispatch({
      userId: "u1",
      recipient: "a@b.test",
      event: "BOOKING_CONFIRMED",
      kind: "notify",
      channel: "EMAIL",
      status: "sent",
      subject: "Сессия подтверждена",
      body: "<p>ждём вас</p>",
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data).toMatchObject({
      userId: "u1",
      event: "BOOKING_CONFIRMED",
      status: "sent",
      body: "<p>ждём вас</p>",
    });
  });

  it("тело АККАУНТНОГО письма не сохраняется даже когда его передали", async () => {
    await recordNotificationDispatch({
      recipient: "a@b.test",
      event: "ACCOUNT_PASSWORD_RESET",
      kind: "account",
      channel: "EMAIL",
      status: "sent",
      subject: "Сброс пароля",
      body: "<a href='https://…/reset?token=СЕКРЕТ'>сбросить</a>",
    });

    const data = create.mock.calls[0][0].data;
    expect(data.body).toBeNull();
    // Тема и адресат остаются: без них нельзя ответить «письмо уходило?».
    expect(data.subject).toBe("Сброс пароля");
    expect(data.recipient).toBe("a@b.test");
  });

  it("падение журнала не превращается в исключение у отправителя", async () => {
    create.mockRejectedValue(new Error("база недоступна"));
    await expect(
      recordNotificationDispatch({
        recipient: "a@b.test",
        event: "BOOKING_CONFIRMED",
        kind: "notify",
        channel: "EMAIL",
        status: "sent",
      }),
    ).resolves.toBeUndefined();
  });

  it("обёртка аккаунтного письма пишет успех и возвращает результат отправки", async () => {
    const result = await withAccountEmailLog(
      { recipient: "a@b.test", event: "ACCOUNT_EMAIL_VERIFY", subject: "Подтвердите email" },
      async () => ({ id: "resend-1" }),
    );

    expect(result).toEqual({ id: "resend-1" });
    expect(create.mock.calls[0][0].data).toMatchObject({
      event: "ACCOUNT_EMAIL_VERIFY",
      status: "sent",
      kind: "account",
    });
  });

  it("обёртка пишет отказ и пробрасывает ошибку дальше", async () => {
    await expect(
      withAccountEmailLog(
        { recipient: "a@b.test", event: "ACCOUNT_EMAIL_VERIFY", subject: "Подтвердите email" },
        async () => {
          throw new Error("resend упал");
        },
      ),
    ).rejects.toThrow("resend упал");

    expect(create.mock.calls[0][0].data).toMatchObject({
      status: "failed",
      error: "resend упал",
    });
  });
});

describe("B599 · срок отмены удаления аккаунта", () => {
  it("одно число, и оно не короче обещанного пользователю", () => {
    // До этого батча: 7 в чистке данных, 10 в настройках, 30 в справке.
    // Человек, пришедший на восьмой день «в обещанный срок», находил аккаунт
    // уже обезличенным.
    expect(ACCOUNT_SOFT_DELETE_GRACE_DAYS).toBe(10);
  });

  it("дата удаления считается от момента запроса", () => {
    const requested = new Date("2026-07-28T10:00:00.000Z");
    expect(accountPurgeDate(requested).toISOString()).toBe("2026-08-07T10:00:00.000Z");
  });

  it("чистка данных берёт тот же срок, что показан человеку", async () => {
    const { RETENTION_POLICY } = await import("@/lib/data-retention");
    expect(RETENTION_POLICY.accountProfile.softDeleteGraceDays).toBe(
      ACCOUNT_SOFT_DELETE_GRACE_DAYS,
    );
  });
});
