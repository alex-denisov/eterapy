/**
 * B481/B484 — финансовое закрытие штрафа поздней отмены и политика
 * надёжности практика (пороги, деприоритизация, гудвилл, бейдж).
 */
import fs from "fs";
import path from "path";
import {
  isDeprioritized,
  lateCancelGoodwillCredits,
  noShowCompensationCredits,
  partitionByReliability,
  reliabilityBadge,
  reliabilityWindowStart,
  LATE_CANCEL_DEPRIORITIZE_THRESHOLD,
  NO_SHOW_DEPRIORITIZE_THRESHOLD,
  RELIABILITY_WINDOW_DAYS,
} from "@/lib/practitioner-reliability";
import { penaltyPractitionerShareKopecks, PENALTY_PAYOUT_HOLD_REASON } from "@/lib/booking-penalty";
import { LATE_CANCEL_RETENTION_PERCENT, penaltyKopecks } from "@/lib/booking-change-rules";

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {},
}));
jest.mock("@/lib/notifications", () => ({ __esModule: true, notify: jest.fn() }));
jest.mock("@/lib/audit", () => ({ __esModule: true, logAudit: jest.fn() }));
jest.mock("@/lib/clarity-credits", () => ({ __esModule: true, grantClarityCredits: jest.fn() }));
jest.mock("@/lib/session-payment", () => ({
  __esModule: true,
  chargeCancellationPenalty: jest.fn(),
  cancelSessionHold: jest.fn(),
  refundSessionForBooking: jest.fn(),
  settleSessionAfterDisputeWindow: jest.fn(),
}));
jest.mock("@/lib/billing-policy", () => ({
  __esModule: true,
  paymentDocumentVersionData: () => ({ offerVersion: "t", termsVersion: "t", consentVersion: "t" }),
}));
jest.mock("@/lib/payout-runs", () => ({
  __esModule: true,
  resolvePractitionerPayoutPlanKey: jest.fn(),
  payoutAvailableAt: jest.fn(),
  PAYOUT_HOLD_DAYS_BY_PLAN: { base: 7, practitioner_pro: 3, practitioner_pro_plus: 1 },
}));

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("B481 — удержание поздней отмены: комиссионная матрица", () => {
  // B567 (owner 2026-07-22): частичного возврата за позднюю отмену и неявку
  // клиента нет — удерживается вся цена сессии.
  it("удержание = 100% цены сессии", () => {
    expect(LATE_CANCEL_RETENTION_PERCENT).toBe(100);
    expect(penaltyKopecks(5000)).toBe(500000);
  });

  it("доля практика = штраф × (1 − комиссия%), как у обычной сессии", () => {
    // 5000₽ сессия → штраф 2500₽ (250000 коп); комиссия 30% → практик 175000 коп.
    expect(penaltyPractitionerShareKopecks(250000, 30)).toBe(175000);
    expect(penaltyPractitionerShareKopecks(250000, 17)).toBe(207500);
    // Комиссия вне диапазона нормализуется, NaN → дефолт 35.
    expect(penaltyPractitionerShareKopecks(100000, Number.NaN)).toBe(65000);
    expect(penaltyPractitionerShareKopecks(100000, 150)).toBe(0);
    expect(penaltyPractitionerShareKopecks(100000, -10)).toBe(100000);
  });

  it("penalty-доля маркируется отдельным holdReason (идемпотентность)", () => {
    expect(PENALTY_PAYOUT_HOLD_REASON).toBe("late_cancel_penalty_share");
  });

  it("approve-CANCEL проходит через settleLateCancelPenalty и пишет lateCancel", () => {
    const route = source("src/app/api/bookings/[id]/change-requests/[requestId]/route.ts");
    expect(route).toContain("settleLateCancelPenalty(booking.id, penaltyKopecks(booking.priceRub))");
    expect(route).toContain("lateCancel,");
    expect(route).toContain("handlePractitionerCancellation");
  });

  it("booking-penalty создаёт клиентскую транзакцию и Payout-долю", () => {
    const lib = source("src/lib/booking-penalty.ts");
    expect(lib).toContain("tx.transaction.create");
    expect(lib).toContain("tx.payout.create");
    expect(lib).toContain("purchaseKind: PENALTY_TRANSACTION_KIND");
  });
});

describe("B484 — пороги надёжности и деприоритизация", () => {
  it("пороги: 3+ поздних отмены ИЛИ 2+ неявки за 30 дней", () => {
    expect(LATE_CANCEL_DEPRIORITIZE_THRESHOLD).toBe(3);
    expect(NO_SHOW_DEPRIORITIZE_THRESHOLD).toBe(2);
    expect(isDeprioritized({ lateCancels30d: 2, noShows30d: 1 })).toBe(false);
    expect(isDeprioritized({ lateCancels30d: 3, noShows30d: 0 })).toBe(true);
    expect(isDeprioritized({ lateCancels30d: 0, noShows30d: 2 })).toBe(true);
  });

  it("окно метрики — скользящие 30 дней", () => {
    const now = new Date("2026-07-16T12:00:00Z");
    expect(RELIABILITY_WINDOW_DAYS).toBe(30);
    expect(reliabilityWindowStart(now).toISOString()).toBe("2026-06-16T12:00:00.000Z");
  });

  it("partitionByReliability — стабильная сортировка, деприоритизированные в конец", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    expect(partitionByReliability(items, new Set(["b"])).map((i) => i.id)).toEqual(["a", "c", "d", "b"]);
    expect(partitionByReliability(items, new Set()).map((i) => i.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("каталог и API применяют деприоритизацию", () => {
    expect(source("src/app/practitioners/page.tsx")).toContain("partitionByReliability");
    expect(source("src/app/api/practitioners/route.ts")).toContain("partitionByReliability");
  });
});

describe("B484 — гудвилл-компенсация", () => {
  it("дефолты: поздняя отмена 1 балл, неявка 3 балла; env-переопределяемо", () => {
    expect(lateCancelGoodwillCredits({} as NodeJS.ProcessEnv)).toBe(1);
    expect(noShowCompensationCredits({} as NodeJS.ProcessEnv)).toBe(3);
    expect(lateCancelGoodwillCredits({ PRACTITIONER_LATE_CANCEL_GOODWILL_CREDITS: "2" } as unknown as NodeJS.ProcessEnv)).toBe(2);
    expect(noShowCompensationCredits({ PRACTITIONER_NO_SHOW_COMPENSATION_CREDITS: "5" } as unknown as NodeJS.ProcessEnv)).toBe(5);
    // Мусор в env не ломает политику.
    expect(lateCancelGoodwillCredits({ PRACTITIONER_LATE_CANCEL_GOODWILL_CREDITS: "-3" } as unknown as NodeJS.ProcessEnv)).toBe(1);
  });

  it("подтверждённая неявка обрабатывается при первом переходе в RESOLVED", () => {
    const lib = source("src/lib/complaint-resolution.ts");
    expect(lib).toContain("handleConfirmedNoShow");
    expect(lib).toContain("complaint.reason === \"PRACTITIONER_NO_SHOW\"");
    expect(lib).toContain("complaint.status !== \"RESOLVED\"");
  });

  it("отмена практиком в PATCH бронирования пишет lateCancel и запускает пост-обработку", () => {
    const route = source("src/app/api/bookings/[id]/route.ts");
    expect(route).toContain("lateCancel,");
    expect(route).toContain("handlePractitionerCancellation");
    expect(route).toContain("isLateChange");
  });
});

describe("B484 — бейдж надёжности", () => {
  it("бейдж только при ≥10 завершённых и ≥95% доведённых, без деприоритизации", () => {
    expect(reliabilityBadge({ completedTotal: 20, completionRate: 1, deprioritized: false }))
      .toEqual({ label: "Проводит все сессии", completionPercent: 100 });
    expect(reliabilityBadge({ completedTotal: 20, completionRate: 0.96, deprioritized: false }))
      .toEqual({ label: "Проводит 96% сессий", completionPercent: 96 });
    expect(reliabilityBadge({ completedTotal: 5, completionRate: 1, deprioritized: false })).toBeNull();
    expect(reliabilityBadge({ completedTotal: 20, completionRate: 0.9, deprioritized: false })).toBeNull();
    expect(reliabilityBadge({ completedTotal: 20, completionRate: 1, deprioritized: true })).toBeNull();
    expect(reliabilityBadge({ completedTotal: 0, completionRate: null, deprioritized: false })).toBeNull();
  });

  it("бейдж показан в публичном профиле", () => {
    expect(source("src/app/practitioners/[slug]/page.tsx")).toContain("reliabilityBadgeInfo");
  });
});

describe("B484 — миграция и события", () => {
  it("схема содержит lateCancel и миграция добавляет колонку", () => {
    expect(source("prisma/schema.prisma")).toContain("lateCancel");
    expect(source("prisma/migrations/20260716090000_b484_late_cancel_flag/migration.sql"))
      .toContain("\"late_cancel\" BOOLEAN NOT NULL DEFAULT false");
  });

  it("события GOODWILL_CREDITS / RELIABILITY_WARNING зарегистрированы во всех каналах", () => {
    const events = source("src/lib/notification-events.ts");
    const delivery = source("src/lib/notification-delivery.ts");
    const email = source("src/lib/email-send.ts");
    for (const file of [events, delivery, email]) {
      expect(file).toContain("GOODWILL_CREDITS");
      expect(file).toContain("RELIABILITY_WARNING");
    }
  });
});
