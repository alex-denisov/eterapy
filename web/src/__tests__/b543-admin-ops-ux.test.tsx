/**
 * B543 — UX-правки операционного центра по owner-ревью staging 2026-07-18:
 *  1) названия продуктов в AI-расходах должны быть на русском;
 *  2) статус LiveKit должен быть содержательным (и кричать на дефолтные креды);
 *  3) карточки-метрики на главных страницах разделов должны быть кликабельны.
 */
import fs from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { productLabel } from "@/app/admin/admin-analytics-data";
import { evaluateLivekitStatus } from "@/lib/livekit-status";
import { AdminOpsMetric, AdminOpsSection } from "@/app/admin/ops/ops-ui";
import { Gauge } from "lucide-react";

/** Ключи, которыми реально размечаются AI-запросы в коде. */
const FEATURE_KEYS = [
  "product-chat-analysis",
  "product-chat-analysis-ocr",
  "product-chat-analysis-ocr-structure",
  "product-circle",
  "product-compatibility",
  "product-deep-report",
  "product-family-questions",
  "product-horoscope",
  "product-human-design",
  "product-natal-chart",
  "product-numerology",
  "product-outside-questions",
  "product-pair",
  "product-reframe",
  "product-surname-origin",
  "product-symbolic",
  "product-compatibility-by-date",
  "product-tarot",
  "product-arcana",
  "companion-chat",
  "daily-practice",
  "dialogue-clarifier",
  "dialogue-primary-answer",
  "dialogue-router",
  "safety-classification",
  "session-compliance",
  "session-stt",
  "session-summary",
  "ai-healthcheck",
];

describe("B543 · русские названия продуктов в AI-расходах", () => {
  it.each(FEATURE_KEYS)("%s → человекочитаемое русское название", (key) => {
    const label = productLabel(key);
    expect(label).toMatch(/[А-Яа-яЁё]/);
    // не должен протекать сырой технический ключ
    expect(label).not.toMatch(/^product-/);
    expect(label).not.toBe(key);
  });

  it("смоук-тесты провайдеров тоже подписаны по-русски", () => {
    expect(productLabel("ops.provider-smoke.anthropic")).toMatch(/[А-Яа-яЁё]/);
  });

  it("неизвестный ключ не притворяется продуктом", () => {
    expect(productLabel(null)).toBe("Не указан");
  });
});

describe("B543 · содержательный статус LiveKit", () => {
  it("без конфигурации сообщает, чего именно не хватает", () => {
    const status = evaluateLivekitStatus({ url: "", apiKey: "", apiSecret: "" });
    expect(status.status).toBe("missing_config");
    expect(status.detail).toContain("LIVEKIT_URL");
    expect(status.detail).toContain("LIVEKIT_API_KEY");
  });

  it("дефолтные devkey/devsecret — это СБОЙ, а не «настроено» (INC-067)", () => {
    const status = evaluateLivekitStatus({
      url: "ws://localhost:7880",
      apiKey: "devkey",
      apiSecret: "devsecret",
    });
    expect(status.status).toBe("down");
    expect(status.detail).toMatch(/умолчани|INC-067/i);
  });

  it("частично дефолтные креды тоже ловятся", () => {
    expect(
      evaluateLivekitStatus({ url: "wss://x", apiKey: "eterapy_prod", apiSecret: "devsecret" }).status,
    ).toBe("down");
  });

  it("настроенный LiveKit показывает хост и НЕ раскрывает секрет", () => {
    const status = evaluateLivekitStatus({
      url: "wss://video.eterapy.com",
      apiKey: "eterapy_prod",
      apiSecret: "super-secret-value",
    });
    expect(status.status).toBe("ok");
    expect(status.detail).toContain("video.eterapy.com");
    expect(status.detail).not.toContain("super-secret-value");
  });

  it("битый URL не роняет страницу", () => {
    expect(evaluateLivekitStatus({ url: "((((", apiKey: "k", apiSecret: "s" }).status).toBe("ok");
  });
});

describe("B543 · кликабельные карточки разделов", () => {
  it("AdminOpsMetric с href рендерит ссылку на якорь блока", () => {
    render(<AdminOpsMetric icon={Gauge} label="Сервисы" value="7" hint="зависимостей" href="#services" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "#services");
    expect(link).toHaveTextContent("Сервисы");
  });

  it("без href карточка остаётся некликабельной", () => {
    render(<AdminOpsMetric icon={Gauge} label="Сервисы" value="7" hint="зависимостей" />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("AdminOpsSection пробрасывает id — якорь существует", () => {
    const { container } = render(
      <AdminOpsSection id="services" title="Сервисы и зависимости">
        <p>тело</p>
      </AdminOpsSection>,
    );
    expect(container.querySelector("section#services")).not.toBeNull();
  });
});

describe("B543 · страница /admin/ops связана якорями", () => {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), "src/app/admin/ops/page.tsx"),
    "utf8",
  );

  it("каждая метрика ведёт куда-то", () => {
    const metrics = source.match(/<AdminOpsMetric/g) ?? [];
    const hrefs = source.match(/href="(#[a-z-]+|\/admin\/[a-z/-]+)"/g) ?? [];
    expect(metrics.length).toBeGreaterThan(0);
    expect(hrefs.length).toBeGreaterThanOrEqual(metrics.length);
  });

  it("все якоря метрик существуют как id секций", () => {
    const anchors = [...source.matchAll(/href="#([a-z-]+)"/g)].map((m) => m[1]);
    const ids = [...source.matchAll(/id="([a-z-]+)"/g)].map((m) => m[1]);
    expect(anchors.length).toBeGreaterThan(0);
    for (const anchor of anchors) expect(ids).toContain(anchor);
  });
});
