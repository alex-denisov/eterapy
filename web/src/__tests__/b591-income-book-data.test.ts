/**
 * B591 фаза 2 — чтение поступлений для книги доходов.
 *
 * Здесь проверяется ровно то, что чистые тесты `b591-income-book.test.ts`
 * проверить не могут: как строка базы превращается в строку книги. Две ловушки,
 * из-за которых цифра в декларации была бы неверной:
 *
 *  • знак на транзакции означает сторону ПОЛЬЗОВАТЕЛЯ, а не направление денег —
 *    сессия записана как списание с клиента и пришла бы в книгу отрицательной;
 *  • внутренние проводки (подписка практика за счёт заработанного) не являются
 *    поступлением, но лежат в той же таблице.
 */
const mockDb = {
  transaction: { findMany: jest.fn(), count: jest.fn() },
  booking: { findMany: jest.fn() },
};
jest.mock("@/lib/db", () => ({ __esModule: true, default: mockDb }));

import { CASH_PROVIDERS, loadIncomeRecords } from "@/lib/ip-income-book-data";

const RANGE = { from: new Date(Date.UTC(2026, 0, 1)), to: new Date(Date.UTC(2027, 0, 1)) };

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.transaction.count.mockResolvedValue(0);
  mockDb.booking.findMany.mockResolvedValue([]);
});

it("внутренние проводки не спрашиваются как поступления, а считаются отдельно", async () => {
  mockDb.transaction.findMany.mockResolvedValue([]);
  mockDb.transaction.count.mockResolvedValue(4);

  const result = await loadIncomeRecords(RANGE);

  expect(result.internalCount).toBe(4);
  const where = mockDb.transaction.findMany.mock.calls[0][0].where;
  expect(where.provider.in).toEqual(expect.arrayContaining([...CASH_PROVIDERS]));
  expect(CASH_PROVIDERS).not.toContain("internal");
  expect(CASH_PROVIDERS).not.toContain("manual");
});

it("сессия приходит в книгу положительным оборотом и со ставкой комиссии из брони", async () => {
  mockDb.transaction.findMany.mockResolvedValue([
    {
      id: "tx-session",
      amount: -300_000, // списание с клиента: знак — сторона пользователя
      currency: "RUB",
      status: "SUCCEEDED",
      provider: "yukassa",
      providerPaymentId: "pay-1",
      invoiceId: 17,
      description: "Оплата сессии b-1",
      metadata: { purchaseKind: "session", bookingId: "b-1" },
      createdAt: new Date(Date.UTC(2026, 6, 25)),
    },
  ]);
  mockDb.booking.findMany.mockResolvedValue([
    { id: "b-1", commissionPercentApplied: 30, practitioner: { commissionPercent: 35 } },
  ]);

  const { records } = await loadIncomeRecords(RANGE);

  expect(records).toHaveLength(1);
  expect(records[0].turnoverKopecks).toBe(300_000);
  expect(records[0].subject).toBe("session");
  // Ставка берётся зафиксированной на сделке, а не текущей у специалиста.
  expect(records[0].commissionPercent).toBe(30);
});

it("нулевые операции в книгу не попадают", async () => {
  mockDb.transaction.findMany.mockResolvedValue([
    {
      id: "tx-zero",
      amount: 0,
      currency: "RUB",
      status: "SUCCEEDED",
      provider: "yookassa",
      providerPaymentId: null,
      invoiceId: 1,
      description: "привязка карты",
      metadata: {},
      createdAt: new Date(Date.UTC(2026, 6, 25)),
    },
  ]);

  const { records } = await loadIncomeRecords(RANGE);
  expect(records).toHaveLength(0);
});

it("оплата звёздами несёт курс в комментарии: рублёвая сумма должна быть проверяема", async () => {
  mockDb.transaction.findMany.mockResolvedValue([
    {
      id: "tx-stars",
      amount: 79_000,
      currency: "XTR",
      status: "SUCCEEDED",
      provider: "telegram_stars",
      providerPaymentId: "stars-12",
      invoiceId: 12,
      description: "Пакет баллов",
      metadata: { purchaseKind: "credits", starsAmount: 494, starsRubRate: 1.6 },
      createdAt: new Date(Date.UTC(2026, 6, 26)),
    },
  ]);

  const { records } = await loadIncomeRecords(RANGE);
  expect(records[0].note).toContain("494 ★");
  expect(records[0].note).toContain("1.6");
});

it("возврат попадает в книгу без придуманной даты возврата", async () => {
  mockDb.transaction.findMany.mockResolvedValue([
    {
      id: "tx-refunded",
      amount: 29_900,
      currency: "RUB",
      status: "REFUNDED",
      provider: "robokassa",
      providerPaymentId: "70",
      invoiceId: 70,
      description: "Переосмысление",
      metadata: { purchaseKind: "product", productKey: "reframe" },
      createdAt: new Date(Date.UTC(2026, 6, 27)),
    },
  ]);

  const { records } = await loadIncomeRecords(RANGE);
  expect(records[0].refunded).toBe(true);
  expect(records[0].refundedAt).toBeNull();
});
