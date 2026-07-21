import { readFileSync } from "node:fs";
import { join } from "node:path";
import { humanizeBillingDescription } from "@/lib/billing-labels";

/**
 * B423 (найдено при живой проверке ссылки оплаты 2026-07-21).
 *
 * В фискальный чек уходило `purchase.description`, а это МАШИННАЯ строка вида
 * «ETerapy: deep-report». Чек — документ, который покупатель получает по 54-ФЗ,
 * и наименование предмета расчёта в нём должно позволять понять, что куплено;
 * слаг на латинице этого не делает.
 *
 * Человекочитаемое имя в проекте уже есть — `humanizeBillingDescription`,
 * которым переводится лента операций в кабинете. Чек обязан брать его же.
 */
describe("B423 — наименование в фискальном чеке", () => {
  const checkout = readFileSync(join(process.cwd(), "src/lib/payments/checkout.ts"), "utf8");

  it("собирает позицию чека из человекочитаемого имени, а не из слага", () => {
    expect(checkout).toContain("humanizeBillingDescription");
    expect(checkout).not.toMatch(/name:\s*purchase\.description/);
  });

  it("переводит машинные описания всех платных типов", () => {
    expect(humanizeBillingDescription("ETerapy: deep-report")).toBe("Подробный разбор");
    expect(humanizeBillingDescription("ETerapy: numerology")).toBe("Матрица судьбы");
    expect(humanizeBillingDescription("ETerapy: chat-analysis")).toBe("Разбор переписки");
    // Пакеты баллов и подписки уже приходят человекочитаемыми — не портим их.
    expect(humanizeBillingDescription("Баллы, 10 шт.")).toBe("Баллы, 10 шт.");
    expect(humanizeBillingDescription("ETerapy Premium: первый период")).toBe("Подписка Premium");
  });

  it("никогда не отдаёт пустое имя — в чеке пустая позиция недопустима", () => {
    expect(humanizeBillingDescription("")).toBe("Операция");
    expect(humanizeBillingDescription(null)).toBe("Операция");
    expect(humanizeBillingDescription(undefined)).toBe("Операция");
  });
});
