import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("Admin redesign page diff guardrails", () => {
  it("keeps approved admin-shell structure reachable from the sidebar", () => {
    const shell = source("src/app/admin/admin-shell.tsx");

    expect(shell).toContain('label: "Воронка и конверсии"');
    expect(shell).toContain('adminUrl("/admin/product/funnel")');
    expect(shell).toContain('label: "Контроль и журналы"');
    expect(shell).toContain('adminUrl("/admin/finance/controls")');
    expect(shell).toContain('label: "Надежность сервисов"');
    expect(shell).toContain('label: "Очереди и задачи"');
    expect(shell).toContain('label: "Журналы и аудит"');
    expect(shell).toContain('label: "Безопасность и инциденты"');
  });

  it("shows subscription purchases and credit balance analytics in product retention", () => {
    const data = source("src/app/admin/admin-analytics-data.ts");
    const overview = source("src/app/admin/product/page.tsx");
    const subscriptions = source("src/app/admin/product/subscriptions/page.tsx");

    expect(data).toContain("subscriptionPurchases");
    expect(data).toContain("creditsBalanceByDay");
    expect(overview).toContain("Покупки подписок по дням");
    expect(overview).toContain("Баллы на балансе по дням");
    expect(subscriptions).toContain("Покупки подписок по дням");
    expect(subscriptions).toContain("Баллы на балансе по дням");
  });

  it("keeps legacy finance analytics URLs from turning into 404 pages", () => {
    const controls = source("src/app/admin/finance/controls/page.tsx");
    const transactionsAlias = source("src/app/admin/finance/transactions/page.tsx");
    const pricingAlias = source("src/app/admin/finance/pricing/page.tsx");
    const creditsAlias = source("src/app/admin/finance/credits/page.tsx");

    expect(controls).toContain('title="Контроль и журналы"');
    expect(transactionsAlias).toContain('from "../receipts/page"');
    expect(pricingAlias).toContain('from "../../pricing/page"');
    expect(creditsAlias).toContain('from "../points/page"');
  });

  it("keeps antifraud and system surfaces in Russian user-facing labels", () => {
    const antifraud = source("src/app/admin/antifraud/admin-antifraud-panel.tsx");
    const system = source("src/app/admin/system/page.tsx");
    const ops = source("src/app/admin/ops/page.tsx");

    expect(antifraud).toContain("Аналитика действий");
    expect(antifraud).toContain("Карта доказательств");
    expect(antifraud).not.toContain("Manual review");
    expect(antifraud).not.toContain("Evidence map");
    expect(system).toContain("Надежность сервисов");
    expect(system).toContain("Нагрузка очередей");
    expect(ops).toContain("Операционный центр платформы");
    expect(ops).toContain("Карта здоровья платформы");
  });
});
