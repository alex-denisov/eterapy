import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

// M13 → B466: плоская таблица «Клиенты и записи» уступила клиент-центричному
// списку «Клиенты» (owner-approved CRM): строка клиента → карточка с табами
// Обзор·Сессии·План·Сообщения; сессии-агенда живёт в «Календарь → Расписание».

describe("B466 — practitioner «Клиенты» list (supersedes the M13 table)", () => {
  it("renders the client-centric list with search and attention tags", () => {
    const page = source("src/app/cabinet/practitioner/clients/page.tsx");
    expect(page).toContain("ClientsListClient");
    expect(page).toContain("practitioner-clients-empty");
    const list = source("src/app/cabinet/practitioner/clients/clients-list-client.tsx");
    expect(list).toContain('data-testid="practitioner-clients-search"');
    expect(list).toContain("Требуют внимания");
    expect(list).toContain("разбор");
    expect(list).toContain("/practitioner/clients/");
  });

  it("keeps the client card tabs Обзор · Сессии · План · Сообщения", () => {
    const card = source("src/app/cabinet/practitioner/clients/[id]/page.tsx");
    for (const label of ["Обзор", "Сессии", "План", "Сообщения"]) {
      expect(card).toContain(label);
    }
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
