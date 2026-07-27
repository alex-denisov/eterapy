import fs from "node:fs";
import path from "node:path";
import { v5Products, getV5Product } from "@/lib/v5-products";
import { getProductLabel, getProductRoute, humanizeBillingDescription } from "@/lib/billing-labels";

const source = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
const RENAMED = [
  { old: "horary", next: "horoscope", name: "Гороскоп" },
  { old: "surname-story", next: "surname-origin", name: "Происхождение фамилии" },
  { old: "family-scenarios", next: "family-questions", name: "Семейные вопросы" },
  { old: "synastry", next: "compatibility-by-date", name: "Совместимость по дате" },
  { old: "tarot-numerology", next: "arcana", name: "Арканы судьбы" },
] as const;

// Владелец 2026-07-27: «если меняем названия, то и меняем URL slug, меняем в
// суперадминке, меняем в уведомлениях и чеках. Не делаем редиректы, а именно
// меняем».
describe("B609 — переименование услуг вместе со слагами", () => {
  it("каталог отдаёт новые слаги, названия и маршруты", () => {
    for (const { next, name } of RENAMED) {
      const product = getV5Product(next);
      expect(product).toBeDefined();
      expect(product?.name).toBe(name);
      expect(product?.route).toBe(`/products/${next}`);
      expect(product?.productKey).toBe(next);
    }
  });

  it("старых слагов в каталоге не осталось", () => {
    const slugs = v5Products.map((product) => product.slug as string);
    for (const { old } of RENAMED) expect(slugs).not.toContain(old);
  });

  it("страница услуги существует по новому адресу и не существует по старому", () => {
    for (const { old, next } of RENAMED) {
      expect(getV5Product(next)).toBeDefined();
      // Редиректа нет намеренно: владелец просил именно смену адреса.
      expect(getV5Product(old)).toBeUndefined();
    }
  });

  it("API-маршруты переехали вместе со слагом", () => {
    expect(fs.existsSync(path.join(process.cwd(), "src/app/api/products/compatibility-by-date/route.ts"))).toBe(true);
    expect(fs.existsSync(path.join(process.cwd(), "src/app/api/products/surname-origin/route.ts"))).toBe(true);
    expect(fs.existsSync(path.join(process.cwd(), "src/app/api/products/synastry/route.ts"))).toBe(false);
    expect(fs.existsSync(path.join(process.cwd(), "src/app/api/products/surname-story/route.ts"))).toBe(false);
    // Слаг `compatibility` остаётся за legacy-движком парной совместимости:
    // если бы синастрия заняла его, оплаченные результаты ушли бы в чужой продукт.
    const legacy = source("src/app/api/products/compatibility/route.ts");
    expect(legacy).toContain('const PRODUCT_KEY = "compatibility"');
    const renamed = source("src/app/api/products/compatibility-by-date/route.ts");
    expect(renamed).toContain('const PRODUCT_KEY = "compatibility-by-date"');
  });

  it("чек и письмо о покупке называют услугу новым именем", () => {
    for (const { next, name } of RENAMED) {
      expect(getProductLabel(next)).toBe(name);
      expect(humanizeBillingDescription(`ETerapy: ${next}`)).toBe(name);
      expect(getProductRoute(next)).toBe(`/products/${next}`);
    }
  });

  it("уже проведённые платежи со старым ключом читаются и ведут на новый адрес", () => {
    // Описание транзакции — финансовая история, её не переписывают. Значит
    // старый ключ обязан оставаться читаемым.
    for (const { old, next, name } of RENAMED) {
      expect(humanizeBillingDescription(`ETerapy: ${old}`)).toBe(name);
      expect(getProductRoute(old)).toBe(`/products/${next}`);
    }
  });

  it("миграция переносит оплаченный доступ, результаты и промты", () => {
    const migration = source("prisma/migrations/20260727120000_b609_service_rename_slugs/migration.sql");
    for (const { old, next } of RENAMED) {
      expect(migration).toContain(`WHERE "productKey" = '${old}'`);
      expect(migration).toContain(`WHERE product_key = '${old}'`);
      expect(migration).toContain(`'${next}'`);
    }
    for (const table of ["product_entitlements", "product_results", "ai_prompt_configs", "platform_settings"]) {
      expect(migration).toContain(table);
    }
    // В `transactions` ключа продукта нет — там описание платежа, и его не
    // переписывают. Проверка держит это решение явным.
    expect(migration).not.toContain('UPDATE transactions');
  });

  it("публичные заголовки услуг переписаны на язык запроса", () => {
    const seo = source("src/lib/public-page-seo.ts");
    expect(seo).toContain('"/products/horoscope"');
    expect(seo).toContain('"/products/surname-origin"');
    expect(seo).toContain('"/products/compatibility-by-date"');
    expect(seo).toContain("Происхождение фамилии: значение, история и число рода | ETerapy");
    expect(seo).toContain("Гороскоп на вопрос: точный ответ да или нет | ETerapy");
    expect(seo).not.toContain("Хорарная астрология");
    expect(seo).not.toContain("Кармический код фамилии");
  });
});

describe("B591 фаза 3 — платежей, которых не было, в базе не остаётся", () => {
  it("миграция удаляет рельс ЮKassa и тестовые платежи", () => {
    const migration = source("prisma/migrations/20260727130000_b591_drop_payments_that_never_happened/migration.sql");
    expect(migration).toContain("DELETE FROM transactions WHERE provider IN ('yookassa', 'yukassa')");
    expect(migration).toContain("DELETE FROM transactions WHERE test_mode = true");
    // Доступ тестовых аккаунтов не снимается — меняется только источник.
    expect(migration).toContain("UPDATE user_subscriptions SET provider = 'internal'");
    expect(migration).not.toContain("DELETE FROM user_subscriptions");
  });

  it("книга доходов выводится таблицей суперадминки, а не простынёй", () => {
    const page = source("src/app/admin/finance/accounting/page.tsx");
    const table = source("src/app/admin/finance/accounting/income-book-table.tsx");
    expect(page).toContain("<IncomeBookTable");
    expect(table).toContain("AdminCompactDataTable");
    expect(table).toContain('filterKind: "select"');
    expect(table).toContain("pageSize={25}");
  });

  it("семантическое ядро тоже выведено таблицей суперадминки", () => {
    const table = source("src/app/admin/marketing/semantic-core-table.tsx");
    expect(table).toContain("AdminCompactDataTable");
    expect(table).toContain('key: "service"');
    expect(table).toContain("pageSize={25}");
  });
});
