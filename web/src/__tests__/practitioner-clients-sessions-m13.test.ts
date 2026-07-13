import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

// M13 → B466: плоская таблица «Клиенты и записи» уступила клиент-центричному
// списку «Клиенты» (owner-approved CRM): строка клиента → карточка с табами
// Обзор·Сессии·План·Сообщения; сессии-агенда живёт в «Календарь → Расписание».

describe("B466 — practitioner «Клиенты» list (supersedes the M13 table)", () => {
  it("renders the desktop client master-detail with search, filters and a selectable list", () => {
    const page = source("src/app/cabinet/practitioner/clients/page.tsx");
    // R9-5: desktop is a master-detail — searchable/filterable list on the left,
    // the selected client's card (reusing the [id] card components) on the right.
    expect(page).toContain("ClientsMasterListDesktop");
    expect(page).toContain("practitioner-clients-empty");
    expect(page).toContain('data-testid="practitioner-client-card"');
    expect(page).toContain("CardOverview");
    const list = source("src/app/cabinet/practitioner/clients/clients-master-desktop.tsx");
    expect(list).toContain('data-testid="practitioner-clients-search"');
    expect(list).toContain("Требуют внимания");
    expect(list).toContain("разбор");
    // Rows select the client via the master-detail param, not a page navigation.
    expect(list).toContain("?client=");
  });

  it("keeps the client card tabs Обзор · Сессии · План сопровождения · Сообщения", () => {
    // Tabs are shared between /clients (master-detail) and /clients/[id].
    const page = source("src/app/cabinet/practitioner/clients/page.tsx");
    for (const label of ["Обзор", "Сессии", "План сопровождения", "Сообщения"]) {
      expect(page).toContain(label);
    }
    const card = source("src/app/cabinet/practitioner/clients/[id]/page.tsx");
    expect(card).toContain("Индивидуальная сессия");
    expect(card).toContain("client-card-propose");
    expect(card).toContain("client-card-message");
  });

  it("marks разбор statuses on past sessions (готовится/готов)", () => {
    const types = source("src/app/cabinet/practitioner/clients/[id]/card-types.ts");
    expect(types).toContain('"ready"');
    expect(types).toContain('"pending"');
    const sessions = source("src/app/cabinet/practitioner/clients/[id]/card-sessions.tsx");
    expect(sessions).toContain("разбор готовится");
    expect(sessions).toContain("/practitioner/sessions/");
  });
});
