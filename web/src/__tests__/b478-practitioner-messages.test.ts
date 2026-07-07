import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

// B478 — одностороннее «Сообщение» = сервисный АРТЕФАКТ (Option 4, ОРИ-safe):
// без ответной ветки/треда; клиент читает под «Ещё», ответ — на сессии.

describe("B478 one-way practitioner message artifact", () => {
  it("stores the message as a client-bound artifact, not a chat thread", () => {
    const schema = source("prisma/schema.prisma");
    expect(schema).toContain("model PractitionerClientMessage");
    expect(schema).toContain("practitioner_client_messages");
    // Персистентно: привязка к сессии без каскада с видеосессией.
    expect(schema).toMatch(/bookingId\s+String\?\s+@map\("booking_id"\)/);
  });

  it("sends only to own clients and notifies via PRACTITIONER_MESSAGE", () => {
    const api = source("src/app/api/practitioner/messages/route.ts");
    expect(api).toContain("Сообщение можно отправить только своему клиенту");
    expect(api).toContain('event: "PRACTITIONER_MESSAGE"');
    expect(api).toContain("/cabinet/messages/");
  });

  it("rewrites the draft tone via AI (owner mechanic, not decoration)", () => {
    const rewrite = source("src/app/api/practitioner/messages/rewrite/route.ts");
    expect(rewrite).toContain("aiComplete");
    for (const tone of ["warm", "neutral", "brief"]) expect(rewrite).toContain(tone);
    const segment = source("src/app/cabinet/practitioner/sessions/[id]/message-segment.tsx");
    expect(segment).toContain("перепишет черновик через AI");
    expect(segment).toContain("Отправить клиенту");
    // Кнопки «Копировать» нет (owner: Приложить + Отправить).
    expect(segment).not.toMatch(/>\s*Копировать/);
  });

  it("keeps the client surface under «Ещё» — a reading room, not a messenger", () => {
    const navModel = source("src/lib/nav-model.ts");
    expect(navModel).toContain('appUrl("/messages"), label: "Сообщения"');
    // НЕ в первичных мобильных табах клиента.
    const tabsBlock = navModel.slice(
      navModel.indexOf("CLIENT_MOBILE_TABS"),
      navModel.indexOf("GUEST_MOBILE_TABS"),
    );
    expect(tabsBlock).not.toContain("Сообщения");

    const detail = source("src/app/cabinet/messages/[id]/page.tsx");
    expect(detail).toContain("Здесь нельзя ответить");
    expect(detail).toContain("readAt: new Date()");
    const list = source("src/app/cabinet/messages/page.tsx");
    expect(list).toContain("Ответить здесь нельзя");
  });
});
