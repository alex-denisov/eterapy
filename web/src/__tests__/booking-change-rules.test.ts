import {
  LATE_CANCEL_RETENTION_PERCENT,
  isLateChange,
  penaltyAppliesFor,
  penaltyKopecks,
  resolverFor,
} from "@/lib/booking-change-rules";

// B481/B484 — правила переноса/отмены: удержание только за клиентскую отмену
// <24ч (практик может отменить его целиком); перенос бесплатен; отмена
// практиком — клиенту всегда полный возврат.

const now = new Date("2026-07-07T10:00:00.000Z");
const inHours = (h: number) => new Date(now.getTime() + h * 60 * 60 * 1000);

describe("B481 booking change rules", () => {
  it("counts <24h before start as a late change", () => {
    expect(isLateChange(inHours(23), now)).toBe(true);
    expect(isLateChange(inHours(25), now)).toBe(false);
  });

  it("applies the penalty ONLY to a client CANCEL under 24h", () => {
    expect(penaltyAppliesFor({ initiatedBy: "CLIENT", type: "CANCEL", slotStartAt: inHours(5), now })).toBe(true);
    expect(penaltyAppliesFor({ initiatedBy: "CLIENT", type: "CANCEL", slotStartAt: inHours(48), now })).toBe(false);
    // Перенос — бесплатен.
    expect(penaltyAppliesFor({ initiatedBy: "CLIENT", type: "RESCHEDULE", slotStartAt: inHours(5), now })).toBe(false);
    // B484: запросы практика — без штрафа клиенту.
    expect(penaltyAppliesFor({ initiatedBy: "PRACTITIONER", type: "CANCEL", slotStartAt: inHours(5), now })).toBe(false);
    expect(penaltyAppliesFor({ initiatedBy: "PRACTITIONER", type: "RESCHEDULE", slotStartAt: inHours(5), now })).toBe(false);
  });

  // B567 (owner 2026-07-22): «у нас нет частичного возврата за неявку клиента
  // или позднюю отмену» — удержание стало полным, а настройка размера снята.
  it("retains the full session price on a late cancel", () => {
    expect(LATE_CANCEL_RETENTION_PERCENT).toBe(100);
  });

  it("computes retention kopecks from the session price", () => {
    expect(penaltyKopecks(3500)).toBe(350000);
  });

  it("routes resolution to the opposite side", () => {
    expect(resolverFor("CLIENT")).toBe("PRACTITIONER");
    expect(resolverFor("PRACTITIONER")).toBe("CLIENT");
  });
});
