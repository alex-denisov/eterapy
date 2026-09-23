/**
 * B742 — решения владельца 2026-09-12 одним прогоном.
 *
 * Семь пунктов, но у них один общий предмет: контур обязан говорить правду о
 * себе и не тратить проходы на то, чего нет. Reddit убран целиком, мёртвые
 * провайдеры гасятся физически, а отчёт оркестратора перестаёт заканчиваться
 * словом «ничего» и отдавать владельцу английский абзац.
 */

import { AIProvider } from "@prisma/client";
import { CONTENT_PLAN, contentPlanFor } from "@/lib/marketing/content-plan";
import { PLATFORM_PLAYBOOKS } from "@/lib/marketing/platform-playbook";
import { MARKETING_PLATFORM_FIELDS } from "@/lib/marketing/platform-settings";
import { ENGAGEMENT_PLATFORMS } from "@/lib/marketing/engagement-plan";
import { INBOUND_PLATFORMS } from "@/lib/marketing/inbound";
import { MARKETING_MANUAL_PLATFORMS } from "@/lib/marketing/manual-platforms";
import { PUBLICATION_PLATFORMS } from "@/lib/external-publication-shared";
import {
  MARKETING_ACTIVE_PROVIDERS,
  MARKETING_ORCHESTRATOR_REPORT_FEATURE,
  MARKETING_RETIRED_PROVIDERS,
  PUBLIC_MARKETING_AI_FEATURES,
} from "@/lib/marketing/model-pool";
import { diagnose } from "@/lib/marketing/orchestrator-diagnosis";
import {
  BACKLINK_TARGETS,
  automatedBacklinkTargets,
  humanRegistrationTargets,
} from "@/lib/seo/backlink-targets";
import {
  backlinkPoolBlock,
  buildOrchestratorReport,
  directivesBlock,
  looksRussian,
  ownerActionsBlock,
  selfReviewBlock,
} from "@/lib/marketing/orchestrator-report";
import type { OrchestratorState } from "@/lib/marketing/orchestrator-state";

const NOW = new Date("2026-09-12T09:00:00Z");

function stateWith(overrides: Partial<OrchestratorState> = {}): OrchestratorState {
  return {
    now: NOW,
    conveyor: {
      demand: 4,
      buffer: 6,
      ready: 5,
      awaitingReview: 2,
      maxAwaitingReview: 6,
      writtenThisHour: 1,
      deferred: 3,
      perHour: 2,
      writerBudget: 1,
      capacityPerHour: 2,
      materialsLeftToday: 10,
      canSeparateRoles: true,
      bottleneck: "buffer",
      pausedUntil: null,
      idleReason: "Линия работает",
    },
    providers: [
      { provider: "GEMINI", enabled: true, lastSuccessAt: new Date(NOW.getTime() - 60_000), lastErrorAt: null, lastErrorCode: null },
      { provider: "MISTRAL", enabled: true, lastSuccessAt: new Date(NOW.getTime() - 120_000), lastErrorAt: null, lastErrorCode: null },
      { provider: "GROQ", enabled: true, lastSuccessAt: new Date(NOW.getTime() - 300_000), lastErrorAt: null, lastErrorCode: null },
    ],
    platforms: [{ platform: "telegram", published: 3, stalled: 0, topReason: null }],
    signals: [],
    seo: {
      publishedToday: 2,
      publishedWeek: 9,
      dailyCap: 4,
      queueNew: 12,
      queueRejected: 30,
      neverSubmitted: 0,
      lastPublishedAt: new Date(NOW.getTime() - 60 * 60_000),
    },
    search: {
      impressions: 120,
      clicks: 7,
      averagePosition: 18.4,
      searchablePages: 43,
      previousImpressions: 110,
    },
    causes: [],
    stalledIds: [],
    feeds: [],
    lockedSlotIds: [],
    sources: {
      webmaster: { searchablePages: 80, excludedPages: 5, sitemapUrls: 90, recrawlRemaining: 20 },
      webmasterError: null,
      gsc: {
        totals: { clicks: 7, impressions: 120, ctr: 5.8, averagePosition: 18.4 },
        queryCount: 23,
        topQueries: [],
      },
      gscError: null,
    },
    thinCards: 0,
    dzen: { reachable: true, authorized: true, reason: null, account: "eterapy" },
    // B742: маршрут Vertex поднят — иначе здоровый контур поднимал бы находку
    // про неиспользуемый бонус на каждом прогоне, где её не проверяют.
    vertexConfigured: true,
    // B746: тренд и реестр внешних площадок — пустые по умолчанию.
    trend: { days: [], weeks: [], diversity: [], duplicateDraftIds: [] },
    backlinks: [],
    recentDirectives: [],
    ...overrides,
  };
}

describe("B742 §2 — Reddit убран из площадок целиком", () => {
  /**
   * Прогон перечисляет ВСЕ реестры площадок поимённо, а не ищет строку
   * «reddit» по дереву. Причина: удалить площадку из одного списка и забыть
   * второй — ровно тот класс дефекта, из-за которого строка неподключённой
   * площадки неделю перебиралась публикатором (B713 §6). Список реестров
   * закрытый: появится седьмой — он появится и здесь.
   */
  it("ни один реестр площадок Reddit больше не знает", () => {
    expect(Object.keys(PLATFORM_PLAYBOOKS)).not.toContain("reddit");
    expect(MARKETING_PLATFORM_FIELDS.map((field) => field.platform)).not.toContain("Reddit");
    expect(ENGAGEMENT_PLATFORMS as readonly string[]).not.toContain("reddit");
    expect(INBOUND_PLATFORMS as readonly string[]).not.toContain("reddit");
    expect(PUBLICATION_PLATFORMS as readonly string[]).not.toContain("REDDIT");
    expect([...MARKETING_MANUAL_PLATFORMS]).toEqual([]);
  });

  it("план не резервирует под неё ни одного слота — ни скользящий, ни начальный", () => {
    const channels = new Set(contentPlanFor(NOW).map((slot) => String(slot.channel)));
    expect([...channels].sort()).toEqual(["dzen", "instagram", "telegram", "threads", "vk"]);
    expect(CONTENT_PLAN.some((slot) => String(slot.channel) === "reddit")).toBe(false);
  });

  it("у каждой оставшейся площадки есть плейбук: план не может назвать ленту, для которой нет правил", () => {
    for (const slot of contentPlanFor(NOW)) {
      expect(PLATFORM_PLAYBOOKS[String(slot.channel)]).toBeDefined();
    }
  });
});

describe("B742 §6 — мёртвые провайдеры выключаются физически", () => {
  it("список отставленных не пересекается с рабочим пулом", () => {
    for (const provider of MARKETING_RETIRED_PROVIDERS) {
      expect(MARKETING_ACTIVE_PROVIDERS as readonly AIProvider[]).not.toContain(provider);
    }
    expect(MARKETING_RETIRED_PROVIDERS.length).toBeGreaterThan(0);
  });

  it("бутстрап гасит строку провайдера, а не только обходит его в пуле", () => {
    // Требование владельца дословно: «выключив физически чтобы они не мешали
    // пайплайну никак». Выключатель в базе — единственное, что видят и
    // суперадминка, и сторожевая проба, и НЕмаркетинговые маршруты.
    const source = require("fs").readFileSync(
      require("path").join(process.cwd(), "src/lib/ai-gateway/free-tier-bootstrap.ts"),
      "utf8",
    ) as string;
    expect(source).toContain("MARKETING_RETIRED_PROVIDERS");
    expect(source).toContain("enabled: false");
    // И ровно один раз: ручное включение обратно выкатка отменять не имеет права.
    expect(source).toContain("retiredBy");
  });
});

describe("B742 §5 — отчёт оркестратора отвечает владельцу, а не себе", () => {
  it("«ничего не меняю» больше не конец отчёта: называется шаг для человека", () => {
    const empty = directivesBlock([], true).join("\n");
    expect(empty).toContain("требует вашего решения");
    expect(empty).not.toContain("ни одна из находок не чинится");
  });

  it("у каждого шага владельца назван ожидаемый эффект, а не одна просьба", () => {
    const state = stateWith({
      providers: [
        { provider: "GEMINI", enabled: true, lastSuccessAt: new Date(NOW.getTime() - 60_000), lastErrorAt: null, lastErrorCode: null },
      ],
      conveyor: { ...stateWith().conveyor, canSeparateRoles: false },
    });
    const findings = diagnose(state);
    const block = ownerActionsBlock(findings).join("\n");
    expect(block).toContain("Что нужно от вас");
    expect(block).toContain("Что это даст");
    for (const finding of findings.filter((item) => item.ownerAction)) {
      expect(finding.ownerAction!.expected.length).toBeGreaterThan(10);
    }
  });

  it("блок шагов не появляется, когда шагов нет: пустой заголовок перестают читать", () => {
    expect(ownerActionsBlock(diagnose(stateWith()))).toEqual([]);
  });

  it("оркестратор оценивает СВОИ прошлые правки, а не только контур", () => {
    const state = stateWith({
      recentDirectives: [
        { key: "2026-09-11:conveyor.widen_drum", action: "set_setting", problem: "очередь редактора связывает линию", appliedAt: NOW, status: "APPLIED" },
      ],
    });
    const block = selfReviewBlock(state).join("\n");
    expect(block).toContain("Мои прошлые правки за неделю");
    expect(block).toContain("Применено 1");
  });

  it("применённая правка, не снявшая проблему, называется вслух", () => {
    const state = stateWith({
      // Та же находка приходит снова после применённой правки.
      conveyor: { ...stateWith().conveyor, awaitingReview: 9, maxAwaitingReview: 6 },
      recentDirectives: [
        // Ключ ровно в том виде, в каком его пишет оркестратор: `<сутки>:<что правим>`.
        { key: "2026-09-11:conveyor.widen_drum", action: "set_setting", problem: "очередь редактора связывает линию", appliedAt: NOW, status: "APPLIED" },
      ],
    });
    const selfReview = diagnose(state).filter((finding) => finding.code.startsWith("self.ineffective"));
    expect(selfReview.length).toBeGreaterThan(0);
    expect(selfReview[0].severity).toBe("observation");
  });

  it("английский связующий абзац не проходит в отчёт", () => {
    // Промт требует русского, но промт — просьба, а не гарантия: связующий
    // абзац пишет любая живая модель пула.
    expect(looksRussian(
      "The conveyor is healthy and the pipeline is running within its declared limits today.",
    )).toBe(false);
    expect(looksRussian(
      "Линия работает в своих границах: очередь премодерации не переполнена, "
      + "провайдеры отвечают, а страницы выходят по плану суток.",
    )).toBe(true);
  });

  it("короткая строка русской не признаётся: доля букв на ней ничего не значит", () => {
    expect(looksRussian("Ок")).toBe(false);
    expect(looksRussian("")).toBe(false);
  });

  it("у отчёта свой ключ возможности, а не общий с радаром тем", () => {
    expect(MARKETING_ORCHESTRATOR_REPORT_FEATURE).toBe("marketing-orchestrator-report");
    expect(PUBLIC_MARKETING_AI_FEATURES as readonly string[])
      .toContain(MARKETING_ORCHESTRATOR_REPORT_FEATURE);
    expect(MARKETING_ORCHESTRATOR_REPORT_FEATURE).not.toBe("marketing-topic-radar");
  });
});

describe("B742 §7 — неиспользуемый бонус Google виден владельцу, а не молчит", () => {
  /**
   * Снаружи неподнятый маршрут выглядит нормально: материалы выходят, ошибок
   * нет. Именно поэтому находка и нужна — деньги тратятся с карты там, где
   * лежит бонус, а у пробного периода срок девяносто суток.
   */
  it("маршрут не поднят — находка со своим шагом и числом", () => {
    const finding = diagnose(stateWith({ vertexConfigured: false }))
      .find((item) => item.code === "billing.vertex_unused");
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe("observation");
    expect(finding!.ownerAction?.what).toContain("GEMINI_VERTEX_SERVICE_ACCOUNT");
    expect(finding!.ownerAction?.expected).toContain("своих денег не понадобится");
  });

  it("поднятый маршрут находки не поднимает", () => {
    expect(diagnose(stateWith()).some((item) => item.code === "billing.vertex_unused")).toBe(false);
  });

  it("находка не несёт директиву: сервисный аккаунт код себе не выпишет", () => {
    const finding = diagnose(stateWith({ vertexConfigured: false }))
      .find((item) => item.code === "billing.vertex_unused");
    expect(finding!.directive).toBeUndefined();
  });
});

describe("B742 §3 — молчание Дзена перестало быть неотличимым от тишины", () => {
  it("непрошедший вход поднимает находку со своим шагом владельца", () => {
    const state = stateWith({
      dzen: { reachable: true, authorized: false, reason: "session expired", account: null },
      platforms: [{ platform: "dzen", published: 0, stalled: 4, topReason: "not authorized" }],
    });
    const finding = diagnose(state).find((item) => item.code === "platform.dzen_session");
    expect(finding).toBeDefined();
    expect(finding!.ownerAction?.what).toContain("войти в Дзен");
    // Эффект назван числом из снимка, а не общими словами.
    expect(finding!.ownerAction?.expected).toContain("4");
  });

  it("недоступный браузерный сервис и просроченный вход — разные шаги", () => {
    const state = stateWith({
      dzen: { reachable: false, authorized: false, reason: "ECONNREFUSED", account: null },
    });
    const finding = diagnose(state).find((item) => item.code === "platform.dzen_session");
    expect(finding!.ownerAction?.what).toContain("браузерный сервис");
  });

  it("живая сессия находки не поднимает", () => {
    expect(diagnose(stateWith()).some((item) => item.code === "platform.dzen_session")).toBe(false);
  });
});

describe("B742 §4 — внешние ссылки: граница автоматизации объявлена явно", () => {
  /**
   * Владелец согласен на одноразовые аккаунты ради ссылок; я их не завожу, и
   * это инженерный ответ, а не осторожность: массовая расстановка ссылок с
   * заведённых под это аккаунтов — дословное определение ссылочной схемы у
   * обеих систем, фильтр накладывается на домен и снимается месяцами. Домен
   * уже пережил снятие страниц с индекса. Прогон сторожит, чтобы граница не
   * размылась правкой «ну одну площадку можно».
   */
  it("у каждой площадки реестра есть ответ «зачем», кроме ссылки", () => {
    for (const target of BACKLINK_TARGETS) {
      expect(target.why.length).toBeGreaterThan(40);
      expect(target.url.startsWith("https://")).toBe(true);
    }
  });

  it("у каждой человеческой площадки назван конкретный шаг", () => {
    const human = humanRegistrationTargets();
    expect(human.length).toBeGreaterThan(0);
    for (const target of human) {
      expect(target.humanStep && target.humanStep.length > 20).toBe(true);
    }
  });

  it("автоматические площадки — только те, где у нас СВОЙ аккаунт", () => {
    // Ни одной чужой ленты: агент публикует в своё пространство, как и
    // требует периметр (B617). Иначе это тот же краудмаркетинг под другим
    // названием.
    expect(automatedBacklinkTargets().map((target) => target.id).sort())
      .toEqual(["dzen-article", "telegram-channel", "vk-article"]);
    for (const target of automatedBacklinkTargets()) {
      expect(target.humanStep).toBeUndefined();
    }
  });

  it("пул человеческих площадок уходит владельцу раз в неделю, а не каждые сутки", () => {
    // Понедельник по Москве: список не меняется сам, ежедневное повторение
    // научило бы пролистывать весь отчёт.
    const monday = backlinkPoolBlock(new Date("2026-09-14T09:00:00Z"));
    expect(monday.join("\n")).toContain("где нужна ваша регистрация");
    expect(monday.join("\n")).toContain("Яндекс Бизнес");
    expect(backlinkPoolBlock(new Date("2026-09-15T09:00:00Z"))).toEqual([]);
  });

  it("отказ от одноразовых аккаунтов назван владельцу прямо, а не умолчан", () => {
    expect(backlinkPoolBlock(new Date("2026-09-14T09:00:00Z")).join("\n"))
      .toContain("Одноразовые аккаунты ради ссылок не завожу");
  });
});

describe("B742 — отчёт собирается целиком и остаётся читаемым", () => {
  it("шаги владельца и самооценка попадают в собранный отчёт", () => {
    const state = stateWith({
      dzen: { reachable: true, authorized: false, reason: "session expired", account: null },
      recentDirectives: [
        { key: "2026-09-11:conveyor.widen_drum", action: "set_setting", problem: "очередь редактора связывает линию", appliedAt: NOW, status: "APPLIED" },
      ],
    });
    const report = buildOrchestratorReport({
      state,
      findings: diagnose(state),
      directives: [],
      narrative: null,
    });
    expect(report).toContain("Что нужно от вас");
    expect(report).toContain("Мои прошлые правки за неделю");
    // Отчёт существует без модели: связующий абзац необязателен по построению.
    expect(report.startsWith("🧭")).toBe(true);
  });
});
