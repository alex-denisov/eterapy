import fs from "node:fs";
import path from "node:path";

import { toMiniAppPath } from "@/lib/miniapp/navigation";

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function exists(relativePath: string) {
  return fs.existsSync(path.join(process.cwd(), relativePath));
}

describe("B565 — поддержка, «Помощь» и правовые страницы в мини-аппе", () => {
  it("«Помощь» в шапке открывает четыре входа", () => {
    const shell = source("src/components/miniapp/miniapp-shell.tsx");
    const help = shell.slice(shell.indexOf("  help: {"), shell.indexOf("} as const;"));

    expect(help).toContain('href: "/miniapp/support"');
    expect(help).toContain('href: "/miniapp/faq"');
    expect(help).toContain('href: "/miniapp/legal/privacy"');
    expect(help).toContain('href: "/miniapp/legal/terms"');
    expect(help).toContain("Центр поддержки");
    expect(help).toContain("Частые вопросы");
    expect(help).toContain("Политика конфиденциальности");
    expect(help).toContain("Условия использования");
  });

  it("Центр поддержки переиспользует вебовые механики, а не копирует их", () => {
    const screen = source("src/components/miniapp/screens/support-screen.tsx");

    expect(exists("src/app/miniapp/support/page.tsx")).toBe(true);
    // Тот же компонент, что в вебе: поиск, категории, вопросы темы, эскалация.
    expect(screen).toContain('import { SupportHelpCenter } from "@/components/support/support-help-center"');
    // Владелец: «оставить только блок умной поддержки» — свой заголовок экрана
    // вместо второго заголовка внутри блока.
    expect(screen).toContain("showHeading={false}");
    expect(screen).toContain("showChat={data.viewer.authenticated}");
  });

  it("блок умной поддержки умеет отдавать заголовок оболочке", () => {
    const center = source("src/components/support/support-help-center.tsx");

    expect(center).toContain("showHeading = true");
    expect(center).toContain("{showHeading ? (");
    // Механики на месте — их владелец просил сохранить.
    expect(center).toContain('data-testid="support-search-input"');
    expect(center).toContain('data-testid="support-categories"');
    expect(center).toContain('data-testid="support-escalation-actions"');
  });

  it("«Частые вопросы» берут ту же базу знаний, что и веб", () => {
    const faq = source("src/components/miniapp/screens/faq-screen.tsx");

    expect(exists("src/app/miniapp/faq/page.tsx")).toBe(true);
    expect(faq).toContain('import { HELP_FAQ_CATS, HELP_FAQS } from "@/lib/help-faq-data"');
    expect(faq).toContain('data-testid="miniapp-faq-list"');
    // Аккордеон: раскрыт максимум один ответ, как в вебе.
    expect(faq).toContain("setOpenId(open ? null : item.id)");
  });

  it("правовые документы берутся из общего пакета, а не дублируются", () => {
    const route = source("src/app/miniapp/legal/[doc]/page.tsx");

    expect(route).toContain('from "@/lib/legal/registry"');
    expect(route).toContain('import { legalDocMarkdown } from "@/lib/legal/pack"');
    expect(route).toContain("export const dynamicParams = false");
  });

  it("экран-заглушка снят, старый маршрут ведёт на базу знаний", () => {
    const journey = source("src/components/miniapp/journey-screens.tsx");
    const helpRoute = source("src/app/miniapp/help/page.tsx");

    expect(journey).not.toContain("export function HelpScreen");
    expect(helpRoute).toContain('redirect("/miniapp/faq")');
    // Заглушечный mailto-CTA был единственным действием на том экране.
    expect(journey).not.toContain('href="mailto:support@eterapy.com"');
  });

  it("вебовые адреса поддержки ведут на живые экраны мини-аппа", () => {
    expect(toMiniAppPath("/help")).toBe("/miniapp/faq");
    expect(toMiniAppPath("/support")).toBe("/miniapp/support");
    expect(toMiniAppPath("/cabinet/support")).toBe("/miniapp/support");
    // `/legal/*` остаётся канонической публичной страницей — прежнее решение,
    // экран мини-аппа доступен прямой ссылкой из шторки «Помощь».
    expect(toMiniAppPath("/legal/privacy")).toBe("/legal/privacy");
  });

  it("в мини-аппе не осталось ссылок на снятый экран помощи", () => {
    for (const file of [
      "src/components/miniapp/screens/profile-screen.tsx",
      "src/components/miniapp/screens/home-screen.tsx",
      "src/components/miniapp/miniapp-shell.tsx",
    ]) {
      expect(source(file)).not.toContain("/miniapp/help");
    }
  });
});
