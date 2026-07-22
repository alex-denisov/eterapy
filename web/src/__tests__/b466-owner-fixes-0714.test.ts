import fs from "node:fs";
import path from "node:path";
import { validateInn } from "@/lib/practitioner-tax-verification";
import { AGENT_OFFER_VERSION_LABEL } from "@/lib/practitioner-compliance";

// B466 — правки owner-ревью десктопа 2026-07-14 (6 пунктов, см. Work-log
// тикета). Тесты фиксируют каждую правку по исходникам + чистую логику.

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

const shell = read("src/components/cabinet/cabinet-shell.tsx");
const softCss = read("src/app/v4-soft.css");
const header = read("src/components/header.tsx");
const scheduleSettings = read("src/components/schedule/schedule-settings.tsx");
const bell = read("src/components/notification-bell.tsx");
const practitionerAppbar = read("src/components/cabinet/practitioner-appbar.tsx");
const practitionerSettingsPage = read("src/app/cabinet/practitioner/settings/page.tsx");
const practitionerSettingsClient = read("src/app/cabinet/practitioner/profile/practitioner-settings-client.tsx");
const clientSettings = read("src/app/cabinet/settings/settings-client.tsx");
const requisitesTab = read("src/app/cabinet/practitioner/finance/requisites-tab.tsx");
const financeMobile = read("src/app/cabinet/practitioner/finance/finance-mobile.tsx");
const taxStatusForm = read("src/app/cabinet/practitioner/finance/tax-status/tax-status-form.tsx");
const requisitesEditForm = read("src/app/cabinet/practitioner/finance/requisites/edit/requisites-edit-form.tsx");

describe("B466 owner-fix #1 — сайдбар практика приклеен (хедер/левый край/футер)", () => {
  it("full-bleed sticky сайдбар — у ОБОИХ кабинетов (B512 R1-4: клиент как практик)", () => {
    expect(shell).toContain("soft-app-sidebar-col hidden shrink-0 md:block");
    // B512 R1-4: клиентская плавающая карточка заменена той же приклеенной
    // колонкой, что у практика; sticky живёт на внутренней карточке.
    expect(shell).not.toContain("self-start md:flex");
    expect(shell).toContain('"soft-app-sidebar-card sticky top-16 flex flex-col overflow-hidden p-3.5"');
  });

  it("CSS: практик-layout без центрирования .soft-shell и без вертикальных отступов, колонка растягивается", () => {
    expect(softCss).toContain('.soft-app-shell[data-shell-role="PRACTITIONER"] .soft-app-layout');
    const block = softCss.split('.soft-app-shell[data-shell-role="PRACTITIONER"] .soft-app-layout')[1]!.split("}")[0]!;
    expect(block).toContain("width: 100%");
    expect(block).toContain("margin-inline: 0");
    expect(block).toContain("padding-block: 0");
    expect(block).toContain("align-items: stretch");
    // колонка несёт фон/границу, чтобы дотягиваться до футера мимо sticky-навигации
    expect(softCss).toContain(".soft-app-sidebar-col {");
    expect(softCss).toContain(".soft-app-sidebar-col .soft-app-sidebar-card");
  });

  it("вертикальный ритм контента у практика задают утилиты main (md:pt-8/md:pb-20), не layout", () => {
    expect(shell).toContain('isPractitionerBar ? "md:pb-20 md:pt-8" : "md:pb-0"');
  });
});

describe("B466 owner-fix #2 — «На сайт» рядом с логотипом", () => {
  it("practitioner-service-bridge выравнивается к началу центрального трека", () => {
    const bridge = header.split('data-testid="practitioner-service-bridge"')[1]!.slice(0, 200);
    expect(bridge).toContain("justify-start");
    expect(bridge).not.toContain("justify-center");
  });
});

describe("B466 owner-fix #3 — «Рабочие часы» без счётчика, день не липнет к часам", () => {
  it("счётчик суммарных часов удалён", () => {
    expect(scheduleSettings).not.toContain("ml-2 text-xs text-muted-foreground/60");
    expect(scheduleSettings).not.toContain("rule.endHour - rule.startHour");
  });

  it("колонка дня расширена до w-44 («Воскресенье» + тумблер больше не выталкивают подпись)", () => {
    expect(scheduleSettings).toContain("flex w-44 shrink-0 items-center");
    expect(scheduleSettings).not.toContain("flex w-32 shrink-0");
  });
});

describe("B466 owner-fix #4 — «Настроить уведомления» ведёт в блок «Уведомления»", () => {
  it("колокольчик принимает settingsHref и использует его в футере", () => {
    expect(bell).toContain("settingsHref?: string");
    expect(bell).toContain('settingsHref ?? appUrl("/settings")');
  });

  it("хедер передаёт роль-специфичный адрес (практик: ?tab=notifications, клиент: якорь)", () => {
    expect(header).toContain('appUrl("/practitioner/settings?tab=notifications")');
    expect(header).toContain('appUrl("/settings#settings-notifications")');
  });

  it("pcab-appbar и клиентский мобильный appbar тоже указывают в блок уведомлений", () => {
    expect(practitionerAppbar).toContain('settingsHref={appUrl("/practitioner/settings?tab=notifications")}');
    expect(shell).toContain('settingsHref={appUrl("/settings#settings-notifications")}');
  });

  it("настройки практика открывают суб-таб из ?tab=", () => {
    expect(practitionerSettingsPage).toContain("searchParams");
    expect(practitionerSettingsPage).toContain('tab === "notifications"');
    expect(practitionerSettingsPage).toContain("initialTab={initialTab}");
    expect(practitionerSettingsClient).toContain("initialTab?: Tab");
    expect(practitionerSettingsClient).toContain("useState<Tab>(initialTab)");
  });

  it("клиентский хаб настроек раскрывает строку по хэшу (#settings-notifications)", () => {
    expect(clientSettings).toContain('id="settings-notifications"');
    expect(clientSettings).toContain("HTMLDetailsElement");
  });
});

describe("B466 owner-fix #5 — агентская оферта: русское название + гиперссылка", () => {
  it("экспортируется человекочитаемое название версии", () => {
    expect(AGENT_OFFER_VERSION_LABEL).toBe("редакция от 20 июля 2026 года");
    // слаг не должен утекать в баннер (сравнение версии — отдельно)
    expect(AGENT_OFFER_VERSION_LABEL).not.toContain("agent-offer");
  });

  it("десктоп-баннер: ссылка на /legal/agent-offer + читаемое название, слаг убран", () => {
    const banner = requisitesTab.split("Для выплат нужно принять")[1]!.slice(0, 600);
    expect(banner).toContain('mainUrl("/legal/agent-offer")');
    expect(banner).toContain("AGENT_OFFER_VERSION_LABEL");
    expect(banner).not.toContain("{AGENT_OFFER_VERSION}");
  });

  it("мобильный баннер: та же ссылка и название", () => {
    const banner = financeMobile.split("Для выплат нужно принять")[1]!.slice(0, 600);
    expect(banner).toContain('mainUrl("/legal/agent-offer")');
    expect(banner).toContain("AGENT_OFFER_VERSION_LABEL");
    expect(banner).not.toContain("{AGENT_OFFER_VERSION}");
  });
});

describe("B466 owner-fix #6 — tax-status: требование к ИНН живёт с переключателем", () => {
  it("хинт длины динамический (десктоп + pcab), статический текст убран", () => {
    expect(taxStatusForm).toContain("Для статуса «{TAX_STATUS_LABELS[status]}» ИНН — {expected} цифр");
    expect(taxStatusForm).not.toContain("12 цифр — для самозанятого и ИП, 10 — для юр. лица");
    expect(taxStatusForm).toContain('data-testid="practitioner-tax-inn-hint"');
    expect(taxStatusForm).toContain('data-testid="practitioner-tax-inn-hint-mobile"');
  });

  it("inline-прогресс и inline-ошибка контрольной суммы вместо молчаливой кнопки", () => {
    expect(taxStatusForm).toContain("innLengthMismatch");
    expect(taxStatusForm).toContain("innChecksumFail");
    expect(taxStatusForm).toContain("Введено {innDigits.length} из {expected} цифр");
    expect(taxStatusForm).toContain('data-testid="practitioner-tax-inn-checksum"');
  });

  it("валидация ИНН по статусу: длина меняется 12/12/10", () => {
    // 500100732259 — валидный 12-значный ИНН (контрольные суммы ФНС)
    expect(validateInn("500100732259", "SELF_EMPLOYED").ok).toBe(true);
    expect(validateInn("500100732259", "INDIVIDUAL_ENTREPRENEUR").ok).toBe(true);
    // тот же ИНН для юр. лица не подходит по длине (нужно 10)
    const asEntity = validateInn("500100732259", "LEGAL_ENTITY");
    expect(asEntity.ok).toBe(false);
    expect(asEntity.error).toContain("10 цифр");
    // валидный 10-значный ИНН юр. лица
    expect(validateInn("7707083893", "LEGAL_ENTITY").ok).toBe(true);
    expect(validateInn("7707083893", "SELF_EMPLOYED").ok).toBe(false);
  });

  it("реквизиты выплат: клиентская предвалидация зеркалит серверные правила", () => {
    expect(requisitesEditForm).toContain("function validate()");
    expect(requisitesEditForm).toContain("Введите номер карты (16–19 цифр)");
    expect(requisitesEditForm).toContain("Введите номер телефона для СБП");
    expect(requisitesEditForm).toContain("Расчётный счёт — 20 цифр");
    expect(requisitesEditForm).toContain("БИК банка — 9 цифр");
    expect(requisitesEditForm).toContain("toast.error(validationError)");
  });
});
