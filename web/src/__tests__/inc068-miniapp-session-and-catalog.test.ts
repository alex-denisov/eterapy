import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { GET as logoutGet } from "@/app/api/auth/logout/route";
import { MINIAPP_SERVICES, miniAppService } from "@/lib/miniapp/catalog";
import { MINIAPP_DIRECTIONS, matchesDirection } from "@/lib/miniapp/practitioner-filter";
import { formatPoints } from "@/lib/points";

const root = process.cwd();
const source = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("INC-068 — выход по префетчу больше не рушит сессию", () => {
  // Разбор в тикете: `<Link href="/api/auth/logout">` на экране профиля
  // предзагружался, как только попадал во вьюпорт, а обработчик чистил все
  // куки. В логах прода это видно по маркеру `_rsc=` за секунды до того, как
  // клиента выбрасывало на экран входа.
  it("запрос с признаком предзагрузки не трогает куки", async () => {
    for (const headers of [
      { "next-router-prefetch": "1" },
      { purpose: "prefetch" },
      { "sec-purpose": "prefetch;prerender" },
    ]) {
      const response = await logoutGet(
        new NextRequest("https://eterapy.com/api/auth/logout?callbackUrl=/miniapp", { headers }),
      );
      expect(response.status).toBe(204);
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  });

  it("RSC-запрос Next (`_rsc=`) тоже не разлогинивает", async () => {
    const response = await logoutGet(
      new NextRequest("https://eterapy.com/api/auth/logout?callbackUrl=/miniapp&_rsc=gGTwZlY8"),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("настоящий переход по-прежнему завершает сессию", async () => {
    const response = await logoutGet(
      new NextRequest("https://eterapy.com/api/auth/logout?callbackUrl=/miniapp"),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("set-cookie")).toContain("authjs.session-token=");
  });

  it("выход на экране профиля — действие, а не ссылка", () => {
    const screen = source("src/components/miniapp/screens/profile-screen.tsx");
    expect(screen).not.toContain('<Link className={styles.signout}');
    expect(screen).toContain('window.location.href = "/api/auth/logout?callbackUrl=/miniapp"');
  });
});

describe("INC-068 — склонение баллов в шапке", () => {
  it("считается, а не зашито строкой", () => {
    const shell = source("src/components/miniapp/miniapp-shell.tsx");
    expect(shell).not.toContain("} баллов`");
    expect(shell).toContain("formatPoints(data.viewer.points)");
  });

  it("9662 — это «балла», а не «баллов»", () => {
    expect(formatPoints(9662)).toBe("9662 балла");
    expect(formatPoints(1)).toBe("1 балл");
    expect(formatPoints(5)).toBe("5 баллов");
    expect(formatPoints(11)).toBe("11 баллов");
  });
});

describe("B556 — описания услуг относятся к своей услуге", () => {
  it("у Натальной карты нет кросс-продажи совместимости", () => {
    const natal = miniAppService("natal-chart");
    expect(natal).not.toBeNull();
    expect(natal?.priceMeta).toBe("или −2 балла");
    expect(`${natal?.priceMeta} ${natal?.description}`).not.toMatch(/партнёр|совместимост/i);
  });

  it("у Дизайна человека бесплатная часть вынесена отдельной строкой", () => {
    const hd = miniAppService("human-design");
    expect(hd?.priceMeta).toBe("или −2 балла");
    expect(hd?.freeNote).toContain("бесплатно");
  });

  it("ни одна услуга не рекламирует в цене другую услугу", () => {
    for (const service of MINIAPP_SERVICES) {
      expect(service.priceMeta).not.toMatch(/₽.*₽/);
      if (service.creditCost) expect(service.priceMeta).toBe(`или −${service.creditCost} ${service.creditCost === 1 ? "балл" : service.creditCost < 5 ? "балла" : "баллов"}`);
    }
  });

  it("кнопка «Закрыть» в шторке не ловит глобальное золотое кольцо фокуса", () => {
    const css = source("src/app/miniapp/miniapp-v21.module.css");
    expect(css).toMatch(/\.bottom-sheet button:focus-visible/);
  });
});

describe("B558 — единый каталог и общие направления", () => {
  it("эзотерика называется одинаково на обоих экранах", () => {
    expect(MINIAPP_DIRECTIONS.map((item) => item.label)).toEqual(["Все", "Психология", "Эзотерика"]);
    const journey = source("src/components/miniapp/journey-screens.tsx");
    expect(journey).not.toContain('label: "Практики"');
  });

  it("универсал (legacy joint) виден в обоих направлениях", () => {
    const universal = { categories: ["joint"] };
    expect(matchesDirection("psychology", universal)).toBe(true);
    expect(matchesDirection("esoteric", universal)).toBe(true);
    expect(matchesDirection("psychology", { categories: ["esoteric"] })).toBe(false);
  });

  it("над списком больше нет постоянных кнопок «Специалисты» и «Библиотека»", () => {
    const screen = source("src/components/miniapp/screens/services-screen.tsx");
    expect(screen).not.toContain("service-shortcuts");
    // «Библиотека вопросов» осталась одна — и в самом низу страницы.
    expect(screen.indexOf('data-group-id="library"')).toBeGreaterThan(screen.indexOf('data-group-id="services"'));
  });

  it("селекторы — стеклянные и на всю ширину", () => {
    const css = source("src/app/miniapp/miniapp-v21.module.css");
    expect(css).toMatch(/\.glass-segmented[\s\S]*?backdrop-filter/);
    expect(css).toMatch(/\.glass-segmented[\s\S]*?width: 100%/);
  });
});

describe("B557 — запись через календарь и контекст встречи", () => {
  const screen = source("src/components/miniapp/booking-screen.tsx");

  it("день выбирается в календаре, а слоты грузятся под выбранный день", () => {
    expect(screen).toContain("/api/slots/month");
    expect(screen).toContain("/api/slots/available");
    expect(screen).toContain("monthGrid");
  });

  it("по умолчанию выбран сегодняшний день, если он открыт", () => {
    expect(screen).toContain("dates.includes(today) ? today : dates[0]");
  });

  it("контекст встречи спрашивается при первой записи и уходит в бронь", () => {
    expect(screen).toContain("validateMeetingContext");
    expect(screen).toContain("meetingContext: askContext ? meetingContext : undefined");
    const page = source("src/app/miniapp/practitioners/[slug]/book/page.tsx");
    expect(page).toContain("askContext");
  });

  it("чувствительный контекст не уезжает в query-строку", () => {
    expect(screen).not.toMatch(/searchParams.*meetingContext|context=\$\{/);
  });
});

describe("B555 — привязка Telegram не обещает того, чего нет", () => {
  const screen = source("src/components/miniapp/journey-screens.tsx");

  it("на экране нет разработческих формулировок", () => {
    // Комментарии, объясняющие починку, сами упоминают старый текст — проверяем
    // то, что реально попадает на экран, а не разбор причин над кодом.
    const rendered = screen.replace(/^\s*(\/\/|\*|\/\*).*$/gm, "");
    expect(rendered).not.toContain("Telegram SSO");
    expect(rendered).not.toContain("Закройте и заново откройте");
  });

  it("кнопка появляется только когда привязка реально доступна", () => {
    expect(screen).toContain("data.viewer.telegramLinkAvailable && !linked");
  });
});
