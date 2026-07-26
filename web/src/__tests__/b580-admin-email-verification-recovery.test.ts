/**
 * B580 (owner 2026-07-26) — восстановление аккаунта с опечаткой в адресе.
 *
 * Живой случай: человек зарегистрировался как `yana_35b@mail.ry` (домен
 * `mail.ry` не существует), письмо подтверждения ушло в никуда. Сам исправить
 * адрес он не может — поле недоступно в кабинете. Владелец исправил адрес в
 * суперадминке, но человеку по-прежнему ничего не пришло: письма ушли на
 * старый ящик, а токен из регистрации живёт 24 часа и к тому моменту истёк
 * (проверено на проде: `verificationExpires` = 2026-07-25, адрес правили
 * позже). Тупик: аккаунт есть, войти нельзя, починить нечем.
 *
 * Отсюда два действия — и они РАЗНЫЕ по смыслу:
 *   • `resend_verification` — штатный путь. Токен перевыпускается, срок идёт
 *     заново, подтверждение по-прежнему даёт сам человек.
 *   • `verify_email` — аварийный. Это ОБХОД доказательства владения ящиком,
 *     поэтому только суперадмин и обязательный след в аудите.
 *
 * Третья правка здесь же: смена адреса СБРАСЫВАЕТ подтверждение. Иначе у
 * подтверждённого пользователя после правки остаётся признак «почта проверена»
 * на ящик, который никто не проверял, — и восстановление пароля уходит туда же.
 */
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { sendVerificationEmail } from "@/lib/email";
import { PATCH } from "@/app/api/admin/users/[id]/route";

jest.mock("@/lib/auth", () => ({ __esModule: true, auth: jest.fn() }));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    user: { findUnique: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
    userSubscription: { updateMany: jest.fn(), create: jest.fn() },
  },
}));

jest.mock("@/lib/audit", () => ({ __esModule: true, logAudit: jest.fn() }));

jest.mock("@/lib/email", () => ({
  __esModule: true,
  sendPasswordResetEmail: jest.fn(),
  sendVerificationEmail: jest.fn(),
}));

jest.mock("@/lib/moderator-permissions", () => ({
  __esModule: true,
  getUserPermissions: jest.fn(async () => ["clients.edit"]),
}));

const mockAuth = auth as unknown as jest.Mock;
const mockFindUnique = db.user.findUnique as unknown as jest.Mock;
const mockUpdate = db.user.update as unknown as jest.Mock;
const mockSend = sendVerificationEmail as unknown as jest.Mock;
const mockAudit = logAudit as unknown as jest.Mock;

const TARGET_ID = "cmrz87sxr001y0kwk11n03p39";

function request(body: Record<string, unknown>): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

const params = { params: Promise.resolve({ id: TARGET_ID }) };

function signInAs(role: "ADMIN" | "SUPERADMIN") {
  mockAuth.mockResolvedValue({ user: { id: "admin-1", role } });
}

function targetUser(overrides: Record<string, unknown> = {}) {
  mockFindUnique.mockResolvedValue({
    id: TARGET_ID,
    email: "yana_35b@mail.ru",
    name: "Яна",
    role: "CLIENT",
    emailVerified: false,
    deletedAt: null,
    ...overrides,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdate.mockResolvedValue({});
  mockSend.mockResolvedValue({});
});

describe("B580 — повторная отправка письма подтверждения", () => {
  it("перевыпускает токен и шлёт письмо на ТЕКУЩИЙ адрес", async () => {
    signInAs("ADMIN");
    targetUser();

    const response = await PATCH(request({ action: "resend_verification" }), params);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, sentTo: "yana_35b@mail.ru" });

    const [[updateArgs]] = mockUpdate.mock.calls;
    expect(updateArgs.where).toEqual({ id: TARGET_ID });
    expect(typeof updateArgs.data.verificationToken).toBe("string");
    expect(updateArgs.data.verificationToken.length).toBeGreaterThan(16);

    // Срок обязан отсчитываться заново — иначе письмо уходит с уже мёртвой
    // ссылкой, ровно как в исходном случае.
    const expires = updateArgs.data.verificationExpires as Date;
    const hoursAhead = (expires.getTime() - Date.now()) / 3_600_000;
    expect(hoursAhead).toBeGreaterThan(23);
    expect(hoursAhead).toBeLessThanOrEqual(24);

    // Письмо уходит с ТЕМ ЖЕ токеном, что записан в базу.
    expect(mockSend).toHaveBeenCalledWith("yana_35b@mail.ru", "Яна", updateArgs.data.verificationToken);
  });

  it("сообщает об ошибке, если письмо не ушло, а не рапортует об успехе", async () => {
    signInAs("ADMIN");
    targetUser();
    mockSend.mockRejectedValue(new Error("resend down"));

    const response = await PATCH(request({ action: "resend_verification" }), params);

    // Молчание здесь дороже ошибки: админ решит, что человек письмо получил.
    expect(response.status).toBe(502);
  });

  it("не шлёт письмо тому, у кого почта уже подтверждена", async () => {
    signInAs("ADMIN");
    targetUser({ emailVerified: true });

    const response = await PATCH(request({ action: "resend_verification" }), params);

    expect(response.status).toBe(400);
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("B580 — подтверждение вручную", () => {
  it("ставит признак, гасит токен и пишет в аудит адрес, принятый на доверии", async () => {
    signInAs("SUPERADMIN");
    targetUser();

    const response = await PATCH(
      request({ action: "verify_email", reason: "адрес исправлен по обращению" }),
      params,
    );

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: TARGET_ID },
      data: { emailVerified: true, verificationToken: null, verificationExpires: null },
    });

    const [, , , details] = mockAudit.mock.calls[0];
    expect(details).toContain("email_verified=manual");
    expect(details).toContain("yana_35b@mail.ru");
    expect(details).toContain("адрес исправлен по обращению");
  });

  it("закрыто для модератора — это обход доказательства владения ящиком", async () => {
    signInAs("ADMIN");
    targetUser();

    const response = await PATCH(request({ action: "verify_email" }), params);

    expect(response.status).toBe(403);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("B580 — смена адреса снимает подтверждение", () => {
  it("сбрасывает признак, когда админ меняет адрес подтверждённому пользователю", async () => {
    signInAs("SUPERADMIN");
    targetUser({ emailVerified: true, email: "old@example.com" });
    mockFindUnique
      .mockResolvedValueOnce({
        id: TARGET_ID, email: "old@example.com", name: "Яна",
        role: "CLIENT", emailVerified: true, deletedAt: null,
      })
      // проверка занятости нового адреса
      .mockResolvedValueOnce(null);

    const response = await PATCH(
      request({ action: "update_profile", email: "new@example.com" }),
      params,
    );

    expect(response.status).toBe(200);
    const [[updateArgs]] = mockUpdate.mock.calls;
    expect(updateArgs.data.email).toBe("new@example.com");
    // Признак относится к АДРЕСУ, а не к аккаунту: новый ящик никто не проверял.
    expect(updateArgs.data.emailVerified).toBe(false);
    expect(updateArgs.data.verificationToken).toBeNull();
  });

  it("не трогает признак, когда адрес не менялся", async () => {
    signInAs("SUPERADMIN");
    mockFindUnique.mockResolvedValue({
      id: TARGET_ID, email: "same@example.com", name: "Яна",
      role: "CLIENT", emailVerified: true, deletedAt: null,
    });

    const response = await PATCH(
      request({ action: "update_profile", email: "same@example.com", timezone: "Europe/Moscow" }),
      params,
    );

    expect(response.status).toBe(200);
    const [[updateArgs]] = mockUpdate.mock.calls;
    expect(updateArgs.data).not.toHaveProperty("emailVerified");
  });
});
