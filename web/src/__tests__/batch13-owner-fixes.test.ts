/**
 * Батч №13 — правки по замечаниям владельца 2026-07-27.
 *
 * Тесты держат ровно те инварианты, нарушение которых владелец увидел
 * собственными глазами: письмо с машинным ключом вместо названия услуги,
 * ссылка «за товаром» в кошелёк, где товара нет.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { getProductLabel, getProductRoute } from "@/lib/billing-labels";

const ROOT = join(__dirname, "..", "..");
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");
const exists = (relative: string) => existsSync(join(ROOT, relative));

describe("B605 — /practice удалён, а не переадресован", () => {
  it("маршрутов больше нет в дереве", () => {
    expect(exists("src/app/cabinet/practice/page.tsx")).toBe(false);
    expect(exists("src/app/miniapp/practice/page.tsx")).toBe(false);
  });

  it("на удалённый адрес ничто не ссылается и не маршрутизирует", () => {
    for (const file of [
      "src/lib/subdomain.ts",
      "src/lib/miniapp/registry.ts",
      "src/lib/miniapp/navigation.ts",
    ]) {
      expect(read(file)).not.toContain("practice");
    }
  });
});

describe("INC-087 — письмо о покупке называет услугу человеческим именем", () => {
  it("productKey `reframe` превращается в название с лендинга", () => {
    expect(getProductLabel("reframe")).toBe("Переосмысление");
  });

  it("ведёт на страницу услуги, а не в кошелёк", () => {
    expect(getProductRoute("reframe")).toBe("/products/reframe");
  });

  it("у пакетов баллов своей страницы выдачи нет — им кошелёк и полагается", () => {
    expect(getProductRoute("pack-5")).toBeNull();
  });

  it("исторический ключ `perspectives` ведёт на переименованную услугу", () => {
    expect(getProductRoute("perspectives")).toBe("/products/reframe");
  });

  it("каждая услуга с человеческим названием имеет либо страницу, либо осознанный null", () => {
    // Ключ, которого мы не знаем, не должен молча стать ссылкой в никуда.
    expect(getProductRoute("совершенно-неизвестный-ключ")).toBeNull();
    expect(getProductLabel("совершенно-неизвестный-ключ")).toBe("совершенно-неизвестный-ключ");
  });
});

describe("B602 — Главная и Кошелёк ровно по ТЗ владельца", () => {
  const home = read("src/app/cabinet/page.tsx");
  const wallet = read("src/app/cabinet/wallet/page.tsx");

  it("Главная: четыре ряда, ни одного `items-start`", () => {
    // «Мозаика», на которую жаловался владелец, — это `items-start`: он
    // отключает выравнивание карточек по высоте внутри ряда.
    expect(home).not.toContain("items-start\"");
    for (const row of ["client-home-row-1", "client-home-row-3", "client-home-row-4"]) {
      expect(home).toContain(`data-testid="${row}"`);
    }
  });

  it("Главная ряд 1: подписка · кошелёк · подарите разбор", () => {
    const row1 = home.slice(home.indexOf('data-testid="client-home-row-1"'), home.indexOf('data-testid="client-home-row-3"'));
    expect(row1).toContain('data-testid="client-subscription-status"');
    expect(row1).toContain('data-testid="client-home-wallet-card"');
    expect(row1).toContain('data-testid="client-referral-card"');
    expect(home).toContain('showMonetization ? "md:grid-cols-3" : ""');
  });

  it("Главная: «подарите разбор» стал компактным — два поясняющих абзаца сняты", () => {
    expect(home).not.toContain("Подарите кому-то первый разбор — и пополните свой баланс");
    expect(home).not.toContain("Когда тот, кого вы позвали, попробует разбор, баллы придут вам обоим.");
  });

  it("Главная: убраны ровно те три блока, что перечислил владелец", () => {
    expect(home).not.toContain("HomePinStrip");
    expect(home).not.toContain('data-testid="client-recent-questions"');
    expect(home).not.toContain('data-testid="client-dashboard-balance"');
  });

  it("Главная ряд 2: «Первые шаги» свёрнуты, с прогресс-баром и одним рядом карточек", () => {
    expect(home).toContain("open={false}");
    expect(home).toContain('data-testid="client-first-steps-progress"');
    expect(home).toContain('role="progressbar"');
    // «в один ряд»: flex + горизонтальная прокрутка, а не перенос в сетку.
    expect(home).toContain("flex snap-x gap-3 overflow-x-auto");
    expect(home).not.toContain("mt-4 grid gap-3 sm:grid-cols-2");
  });

  it("Главная: пройденный шаг помечен галочкой и не кликабелен", () => {
    expect(home).toContain('data-completed="1"');
    expect(home).toContain("mission.completed ? (");
    // Детализация из карточек убрана — остался только заголовок действия.
    expect(home).not.toContain("mission.description");
  });

  it("Главная: прогресс первых шагов не утверждает неправду на нуле", () => {
    // Было «{n} из {m} — осталось немного», что на нуле — прямая неправда.
    expect(home).not.toContain("— осталось немного");
  });

  it("Кошелёк: ряд 1 — «Ваш тариф», ряд 4 — одна «История операций» с вкладками", () => {
    expect(wallet.indexOf('BillingPanel section="plans"')).toBeLessThan(wallet.indexOf("<WalletHistoryTabs"));
    expect(wallet).toContain('data-testid="wallet-history"');
    expect(wallet).toContain("WalletHistoryTabs");
  });

  it("Кошелёк: блок «Карты» удалён целиком, а не оставлен заглушкой", () => {
    expect(wallet).not.toContain("client-saved-cards");
    expect(read("src/components/cabinet/billing-panel.tsx")).not.toContain("client-saved-cards");
  });

  it("Кошелёк: «стартовый подарок» схлопнут в строку внутри «Доступно»", () => {
    // Аналитические атрибуты обязаны пережить переезд — иначе воронка обнулится.
    expect(wallet).toContain('data-analytics-event="welcome_credits_open_reframe_clicked"');
    expect(wallet).toContain('data-testid="welcome-credits-card"');
  });

  it("Кошелёк: ближайшее сгорание видно без клика", () => {
    expect(wallet).toContain("Ближайшее сгорание");
  });

  it("в кризисе первый ряд не становится рядом продаж", () => {
    expect(home).toContain("showMonetization && (subscriptionQualified");
    expect(home).toContain("{showMonetization && (");
    expect(home).toContain('data-testid="client-crisis-continuity"');
  });

  it("INC-087: оплаченный неиспользованный доступ виден в кабинете и в админке", () => {
    expect(home).toContain('data-testid="client-awaiting-access"');
    expect(home).toContain("consumedAt: null");
    expect(read("src/app/admin/users/user-edit-modal.tsx")).toContain('data-testid="admin-user-entitlements"');
    expect(read("src/app/api/admin/entitlements/route.ts")).toContain("awaitingUse");
  });
});
