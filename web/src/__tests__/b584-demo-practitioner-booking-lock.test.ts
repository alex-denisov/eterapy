import type { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import db from "@/lib/db";
import { AGENT_OFFER_VERSION, evaluatePractitionerCommercialGate } from "@/lib/practitioner-compliance";
import { GET as getMonthAvailability } from "@/app/api/slots/month/route";

/**
 * B584 (владелец 2026-07-26): «у всех практиков должно быть отключено всё время
 * в расписании — практики не существуют, они сидированные, и нельзя чтобы
 * реальные клиенты записывались к тестовым практикам».
 *
 * Дефект был двойной: расписание открыто И запись открыта принудительно —
 * `booking_override_enabled` ставился как раз демо-аккаунтам (B459). Поэтому
 * проверка демо-признака обязана стоять ВЫШЕ override'а, иначе он её обходит.
 */

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    practitioner: { findUnique: jest.fn() },
    scheduleRule: { findMany: jest.fn() },
    blockedSlot: { findMany: jest.fn() },
    booking: { findMany: jest.fn() },
    timeSlot: { findMany: jest.fn() },
  },
}));

const mockDb = db as jest.Mocked<typeof db>;

const compliant = {
  id: "practitioner-1",
  status: "ACTIVE" as const,
  demoAccount: false,
  bookingOverrideEnabled: false,
  agentOfferAcceptedAt: new Date("2026-07-20T10:00:00.000Z"),
  agentOfferVersion: AGENT_OFFER_VERSION,
  taxStatus: "SELF_EMPLOYED" as const,
  taxReviewStatus: "VERIFIED" as const,
  taxStatusVerifiedAt: new Date("2026-07-20T10:05:00.000Z"),
  payoutDetails: { type: "CARD", inn: "123456789012", kycStatus: "NOT_REQUIRED", robokassaAccount: "eterapy-spec-01" },
};

describe("B584 демо-профиль закрыт для записи", () => {
  it("блокирует запись к демо-профилю, даже когда все документы в порядке", () => {
    const gate = evaluatePractitionerCommercialGate({ ...compliant, demoAccount: true });
    expect(gate.allowed).toBe(false);
    expect(gate.reasons).toEqual(["demo_account"]);
  });

  it("демо-признак сильнее ручного включения записи (B459 ставил override именно демо-аккаунтам)", () => {
    const gate = evaluatePractitionerCommercialGate({
      ...compliant,
      demoAccount: true,
      bookingOverrideEnabled: true,
      agentOfferAcceptedAt: null,
      agentOfferVersion: null,
    });
    expect(gate.allowed).toBe(false);
    expect(gate.reasons).toContain("demo_account");
  });

  it("не задевает живого специалиста", () => {
    expect(evaluatePractitionerCommercialGate(compliant).allowed).toBe(true);
  });

  it("месячная доступность демо-профиля пуста и не ищет ближайшую дату", async () => {
    (mockDb.practitioner.findUnique as jest.Mock).mockResolvedValue({ demoAccount: true });
    const url = "https://app.eterapy.com/api/slots/month?practitionerId=p1&year=2026&month=7&durationMin=60";
    const response = await getMonthAvailability({ nextUrl: new URL(url), url } as unknown as NextRequest);
    const payload = await response.json();

    expect(payload.availableDates).toEqual([]);
    expect(payload.earliestAvailableDate).toBeNull();
    expect(payload.reason).toBe("demo_account");
    // Расписание даже не читается — ответ известен до запроса в БД.
    expect(mockDb.scheduleRule.findMany).not.toHaveBeenCalled();
  });
});

describe("B584 миграция закрывает уже открытое время", () => {
  const sql = fs.readFileSync(
    path.join(
      process.cwd(),
      "prisma/migrations/20260726160000_b584_demo_practitioner_booking_lock/migration.sql",
    ),
    "utf8",
  );

  it("помечает сидированные профили и гасит их недельные правила", () => {
    expect(sql).toContain('ALTER TABLE "practitioners" ADD COLUMN "demo_account"');
    expect(sql).toMatch(/UPDATE "schedule_rules"[\s\S]*"enabled" = false/);
  });

  it("гасит и разовые слоты — они живут отдельно от недельных правил", () => {
    expect(sql).toMatch(/UPDATE "time_slots"[\s\S]*"available" = false/);
  });
});
