/**
 * B583 — модель расчётов под ограничения Robokassa.
 *
 * Источник истины — ответ поддержки Robokassa (владелец передал 2026-07-27):
 * сплит есть по согласованию, массовых выплат по реквизитам нет вовсе, потолок
 * холда 7 суток, **холд и сплит несовместимы**, адресат — идентификатор
 * МАГАЗИНА, возврат провайдер разносит по долям сам.
 *
 * Тесты закрепляют то, что уже можно закрепить: выбор рельса, границу холда,
 * разнос возврата и то, что исполнение по-прежнему падает закрыто.
 */
import {
  computeSplitRefundDebits,
  evaluateSplitReadiness,
  holdRailCoversBooking,
  latestSessionStartCoveredByHoldRail,
  normalizeRobokassaAccount,
  resolveSettlementRail,
  ROBOKASSA_HAS_MASS_PAYOUTS,
  ROBOKASSA_HOLD_MAX_DAYS,
  SPLIT_AND_HOLD_ARE_EXCLUSIVE,
  splitRefundWindowEndsAt,
} from "@/lib/payments/robokassa-split";
import { robokassaPayoutProvider } from "@/lib/payments/payout-provider";
import { AGENT_OFFER_VERSION, evaluatePractitionerCommercialGate } from "@/lib/practitioner-compliance";

describe("B583 — идентификатор магазина Robokassa", () => {
  it("принимает обычные идентификаторы", () => {
    expect(normalizeRobokassaAccount("eterapy-ivanova")).toBe("eterapy-ivanova");
    expect(normalizeRobokassaAccount("  shop_42  ")).toBe("shop_42");
    expect(normalizeRobokassaAccount("A.B-c_1")).toBe("A.B-c_1");
  });

  it("отвергает пустое и заведомо негодное", () => {
    expect(normalizeRobokassaAccount("")).toBeNull();
    expect(normalizeRobokassaAccount(null)).toBeNull();
    expect(normalizeRobokassaAccount("ab")).toBeNull();
    expect(normalizeRobokassaAccount("иванова")).toBeNull();
    expect(normalizeRobokassaAccount("a".repeat(65))).toBeNull();
  });

  it("не выдумывает более строгий формат, чем известен", () => {
    // Точного формата в контракте нет. Отвергнутый валидный аккаунт стоит
    // специалисту выплаты, поэтому проверка намеренно широкая.
    expect(normalizeRobokassaAccount("12345678")).toBe("12345678");
    expect(normalizeRobokassaAccount("Eterapy.Shop_01-A")).toBe("Eterapy.Shop_01-A");
  });
});

describe("B583 — готовность специалиста к сплиту", () => {
  const ready = { robokassaAccount: "eterapy-ivanova", taxVerified: true, practitionerActive: true };

  it("готов, когда есть аккаунт, статус и активный профиль", () => {
    expect(evaluateSplitReadiness(ready)).toEqual({ ready: true, reasons: [] });
  });

  it("без магазина Robokassa сплит адресовать некуда", () => {
    const result = evaluateSplitReadiness({ ...ready, robokassaAccount: null });
    expect(result.ready).toBe(false);
    expect(result.reasons).toContain("no_robokassa_account");
  });

  it("мусор в поле магазина считается отсутствием магазина", () => {
    // Иначе администратор увидел бы «готов», а сплит упал бы на исполнении.
    expect(evaluateSplitReadiness({ ...ready, robokassaAccount: "  " }).ready).toBe(false);
    expect(evaluateSplitReadiness({ ...ready, robokassaAccount: "ab" }).ready).toBe(false);
  });

  it("называет ВСЕ причины сразу, а не первую", () => {
    const result = evaluateSplitReadiness({
      robokassaAccount: null, taxVerified: false, practitionerActive: false,
    });
    expect(result.reasons).toEqual([
      "no_robokassa_account",
      "tax_not_verified",
      "practitioner_inactive",
    ]);
  });
});

describe("B583 — рельс расчёта (ответ Robokassa 2026-07-27)", () => {
  const splitable = {
    splitAgreedWithProvider: true,
    practitionerSplitReady: true,
    wantsHold: false,
  };

  it("сплит и холд взаимоисключающи — это ограничение провайдера, а не наше", () => {
    expect(SPLIT_AND_HOLD_ARE_EXCLUSIVE).toBe(true);
    expect(ROBOKASSA_HAS_MASS_PAYOUTS).toBe(false);
  });

  it("согласованный сплит и готовый специалист дают сплит без холда", () => {
    expect(resolveSettlementRail(splitable)).toEqual({ rail: "split_no_hold", reasons: [] });
  });

  it("просьба о холде уводит с автоматической выплаты, и причина названа вслух", () => {
    // Молчаливая подмена рельса — это специалист, который ждёт денег
    // автоматически, а получает их вручную и позже.
    const decision = resolveSettlementRail({ ...splitable, wantsHold: true, holdCoversBooking: true });
    expect(decision.rail).toBe("hold_no_split");
    expect(decision.reasons).toContain("hold_and_split_are_exclusive");
  });

  it("несогласованный сплит без холда падает на ручной путь, а не на сплит", () => {
    const decision = resolveSettlementRail({ ...splitable, splitAgreedWithProvider: false });
    expect(decision.rail).toBe("manual_prepay");
    expect(decision.reasons).toEqual(["split_not_agreed_with_provider"]);
  });

  it("неготовый специалист не попадает на сплит-рельс", () => {
    const decision = resolveSettlementRail({ ...splitable, practitionerSplitReady: false });
    expect(decision.rail).toBe("manual_prepay");
    expect(decision.reasons).toContain("practitioner_not_split_ready");
  });

  it("бронь дальше потолка холда не остаётся на холд-рельсе", () => {
    const decision = resolveSettlementRail({
      ...splitable, wantsHold: true, holdCoversBooking: false,
    });
    expect(decision.rail).toBe("manual_prepay");
    expect(decision.reasons).toContain("hold_horizon_exceeded");
  });
});

describe("B583 — граница холда на рельсе без сплита", () => {
  const paidAt = new Date("2026-07-26T10:00:00Z");
  const plusDays = (days: number) => new Date(paidAt.getTime() + days * 86_400_000);

  it("холду достаточно дожить до конца сессии, а не до конца спора", () => {
    // Прежняя версия считала от конца окна диспута — по замыслу «сплит с
    // холдом». Такого рельса не существует: на холд-рельсе доля специалиста
    // остаётся у платформы и удерживается прежним механизмом.
    expect(holdRailCoversBooking(paidAt, plusDays(6))).toBe(true);
    expect(holdRailCoversBooking(paidAt, plusDays(ROBOKASSA_HOLD_MAX_DAYS))).toBe(false);
  });

  it("учитывает длительность сессии — у длинной горизонт короче", () => {
    const edge = latestSessionStartCoveredByHoldRail(paidAt, 60);
    expect(holdRailCoversBooking(paidAt, edge, 60)).toBe(true);
    expect(holdRailCoversBooking(paidAt, new Date(edge.getTime() + 60_000), 60)).toBe(false);
    expect(holdRailCoversBooking(paidAt, edge, 90)).toBe(false);
  });

  it("крайняя дата — семь суток минус длительность сессии", () => {
    const edge = latestSessionStartCoveredByHoldRail(paidAt, 60);
    expect(edge.toISOString()).toBe(
      new Date(paidAt.getTime() + 7 * 86_400_000 - 60 * 60_000).toISOString(),
    );
  });

  it("не покрывает сессию в прошлом", () => {
    expect(holdRailCoversBooking(paidAt, plusDays(-1))).toBe(false);
  });
});

describe("B583 — возврат после сплита разносится по долям", () => {
  const parties = [
    { key: "platform", shareKopecks: 900_00 },
    { key: "shop-ivanova", shareKopecks: 2_100_00 },
  ];

  it("полный возврат списывает ровно доли сторон", () => {
    expect(computeSplitRefundDebits(parties, 3_000_00)).toEqual([
      { key: "platform", debitKopecks: 900_00 },
      { key: "shop-ivanova", debitKopecks: 2_100_00 },
    ]);
  });

  it("частичный возврат бьёт по обеим сторонам, а не только по платформе", () => {
    // «Средства списываются с баланса магазина, в зависимости от доли
    // возврата» — ответ поддержки. Наша статистика обязана совпадать с тем,
    // что провайдер спишет на самом деле.
    expect(computeSplitRefundDebits(parties, 1_000_00)).toEqual([
      { key: "platform", debitKopecks: 300_00 },
      { key: "shop-ivanova", debitKopecks: 700_00 },
    ]);
  });

  it("сумма списаний в точности равна возврату, копейка остатка — на платформе", () => {
    const odd = [
      { key: "shop-ivanova", shareKopecks: 2_00 },
      { key: "platform", shareKopecks: 1_00 },
    ];
    const debits = computeSplitRefundDebits(odd, 1_00);
    expect(debits.reduce((s, d) => s + d.debitKopecks, 0)).toBe(1_00);
    // Остаток от округления берёт сторона с большей долей — спорить о копейке
    // со специалистом, который её не выбирал, нельзя.
    expect(debits.find((d) => d.key === "shop-ivanova")?.debitKopecks).toBe(67);
  });

  it("возврат больше платежа не списывает больше платежа", () => {
    const debits = computeSplitRefundDebits(parties, 10_000_00);
    expect(debits.reduce((s, d) => s + d.debitKopecks, 0)).toBe(3_000_00);
  });

  it("нулевой и отрицательный возврат ничего не списывают", () => {
    expect(computeSplitRefundDebits(parties, 0).every((d) => d.debitKopecks === 0)).toBe(true);
    expect(computeSplitRefundDebits(parties, -5).every((d) => d.debitKopecks === 0)).toBe(true);
  });

  it("окно бесплатного возврата — сутки после конца сессии", () => {
    const endsAt = new Date("2026-07-26T12:00:00Z");
    expect(splitRefundWindowEndsAt(endsAt).toISOString()).toBe("2026-07-27T12:00:00.000Z");
  });
});

describe("B583 — исполнение по-прежнему падает закрыто", () => {
  it("провайдер Robokassa не имитирует успех, пока нет контракта API", () => {
    // Имитация успеха списала бы баланс специалиста без движения денег.
    expect(robokassaPayoutProvider.supportsAutoPayout({ type: "CARD", accountNumber: "1" })).toBe(false);
  });

  it("возвращает FAILED с внятной причиной, а не бросает", async () => {
    const result = await robokassaPayoutProvider.send({
      payoutId: "payout-1",
      details: { type: "CARD", accountNumber: "1" },
      amountKopecks: 100_00,
    });
    expect(result.status).toBe("FAILED");
    expect(result.status === "FAILED" && result.error).toContain("вручную");
  });
});

describe("B583 — магазин Robokassa обязателен (решение владельца)", () => {
  const compliant = {
    id: "p1",
    status: "ACTIVE" as const,
    demoAccount: false,
    bookingOverrideEnabled: false,
    agentOfferAcceptedAt: new Date("2026-07-20T10:00:00.000Z"),
    agentOfferVersion: AGENT_OFFER_VERSION,
    taxStatus: "SELF_EMPLOYED" as const,
    taxReviewStatus: "VERIFIED" as const,
    taxStatusVerifiedAt: new Date("2026-07-20T10:05:00.000Z"),
    payoutDetails: {
      type: "CARD",
      inn: "123456789012",
      kycStatus: "NOT_REQUIRED",
      robokassaAccount: "eterapy-spec-01",
    },
  };

  it("специалист без магазина Robokassa не открывается для записи", () => {
    // Продавать сессию, за которую мы физически не можем заплатить, нельзя:
    // Robokassa переводит долю только на магазин Robokassa получателя.
    const gate = evaluatePractitionerCommercialGate({
      ...compliant,
      payoutDetails: { ...compliant.payoutDetails, robokassaAccount: null },
    });
    expect(gate.allowed).toBe(false);
    expect(gate.reasons).toEqual(["robokassa_account_required"]);
  });

  it("мусор вместо идентификатора не считается указанным магазином", () => {
    const gate = evaluatePractitionerCommercialGate({
      ...compliant,
      payoutDetails: { ...compliant.payoutDetails, robokassaAccount: "  " },
    });
    expect(gate.reasons).toContain("robokassa_account_required");
  });

  it("с магазином гейт открыт", () => {
    expect(evaluatePractitionerCommercialGate(compliant).allowed).toBe(true);
  });
});
