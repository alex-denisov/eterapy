import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("M11 client retention surfaces", () => {
  it("builds the client dashboard from real questions, products, routes, and next action", () => {
    const page = source("src/app/cabinet/page.tsx");

    expect(page).toContain('data-testid="client-map-preview"');
    expect(page).toContain('data-testid="client-next-action"');
    expect(page).toContain('data-testid="client-recent-questions"');
    expect(page).toContain("db.dialogue.count");
    expect(page).toContain("db.productResult.count");
    expect(page).toContain("db.userSubscription.findFirst");
    expect(page).toContain('data-testid="client-subscription-status"');
    expect(page).toContain("getSubscriptionPlanLabel");
    expect(page).toContain("db.clarityRoute.findMany");
    expect(page).toContain('appUrl("/questions")');
    // T16: the cabinet home shows a single "недавние разборы" block with an
    // "Все разборы →" link to the history page. The previously duplicated
    // in-page "История разборов" card was removed (the sidebar nav keeps that
    // label — see the cabinet-shell assertion below).
    expect(page).toContain("недавние разборы");
    expect(page).toContain("Все разборы");
    expect(page).not.toContain("История разборов");
    expect(page).toContain("dialogueStatusLabelRu");
    expect(page).toContain("mainUrl(`/checkin?dialogueId=${recentDialogues[0].id}`)");
  });

  it("adds v4.1 history navigation to the cabinet", () => {
    const shell = source("src/components/cabinet/cabinet-shell.tsx");

    expect(shell).toContain('appUrl("/questions")');
    expect(shell).toContain('"История разборов"');
    expect(shell).toContain('appUrl("/credits")');
    expect(shell).toContain('appUrl("/practice")');
    expect(shell).toContain('"Кредиты ясности"');
    expect(shell).toContain("History");
  });

  it("lets clients browse, continue, and soft-delete their own questions", () => {
    const page = source("src/app/cabinet/questions/page.tsx");
    const route = source("src/app/api/dialogues/[id]/route.ts");

    expect(page).toContain('data-testid="client-questions-page"');
    expect(page).toContain("db.dialogue.findMany");
    expect(page).toContain("userId: session.user.id");
    expect(page).toContain("mainUrl(`/checkin?dialogueId=${dialogue.id}`)");
    expect(page).toContain("async function deleteQuestion");
    expect(page).toContain("db.dialogue.updateMany");
    expect(page).toContain('status: "DELETED"');
    expect(page).toContain("deletedAt: new Date()");
    expect(route).toContain("export async function DELETE");
    expect(route).toContain("...whereOwner");
    expect(route).toContain('status: "DELETED"');
  });

  it("restores an existing dialogue on the question-first page", () => {
    const checkin = source("src/app/checkin/page.tsx");

    expect(checkin).toContain("dialogueId");
    expect(checkin).toContain("fetch(`/api/dialogues/${dialogueId}`");
    expect(checkin).toContain("Восстанавливаю сохраненный диалог");
    expect(checkin).toContain('setPhase("result")');
    expect(checkin).toContain('setPhase("clarifying")');
    expect(checkin).toContain('setPhase("safety")');
  });

  it("keeps action history on the existing modalities history API", () => {
    const page = source("src/app/cabinet/action-history/page.tsx");

    expect(page).not.toContain("/api/ai/history");
  });

  it("implements My Map as a unified save, hide, delete, export, and share surface", () => {
    const page = source("src/app/cabinet/action-history/page.tsx");
    const helper = source("src/lib/my-map.ts");
    const exportRoute = source("src/app/api/cabinet/map/export/route.ts");

    expect(page).toContain('data-testid="my-map-page"');
    expect(page).toContain('data-testid="my-map-items"');
    expect(page).toContain("listMyMapItems");
    expect(page).toContain("async function hideMapItem");
    expect(page).toContain("async function deleteMapItem");
    expect(page).toContain("async function saveMapItem");
    expect(page).toContain("hiddenFromMap");
    expect(page).toContain('href={appUrl("/api/cabinet/map/export")}');
    expect(page).toContain("/share?from=my-map");
    expect(page).toContain('status: "DELETED"');
    expect(page).toContain('status: "CANCELLED"');
    expect(helper).toContain("db.dialogue.findMany");
    expect(helper).toContain("db.productResult.findMany");
    expect(helper).toContain("db.clarityRoute.findMany");
    expect(helper).toContain("isHiddenFromMap");
    expect(helper).toContain("savedAt: { not: null }");
    expect(exportRoute).toContain("Моя карта ETerapy");
    expect(exportRoute).toContain("Content-Disposition");
    expect(exportRoute).toContain("no-store");
  });

  it("adds a once-per-day daily card with notification support", () => {
    const schema = source("prisma/schema.prisma");
    const migration = source("prisma/migrations/20260507033000_add_daily_cards/migration.sql");
    const dailyCard = source("src/lib/daily-card.ts");
    const route = source("src/app/api/cabinet/daily-card/route.ts");
    const dashboard = source("src/app/cabinet/page.tsx");
    const events = source("src/lib/notification-events.ts");
    const delivery = source("src/lib/notification-delivery.ts");

    expect(schema).toContain("model DailyCard");
    expect(schema).toContain("@@unique([userId, cardDate])");
    expect(schema).toContain("DAILY_CARD");
    expect(migration).toContain("CREATE TABLE \"daily_cards\"");
    expect(migration).toContain("ADD VALUE IF NOT EXISTS 'DAILY_CARD'");
    expect(dailyCard).toContain("getOrCreateDailyCard");
    expect(dailyCard).toContain("findUnique");
    expect(dailyCard).toContain("userId_cardDate");
    expect(route).toContain("event: \"DAILY_CARD\"");
    expect(route).toContain("action === \"notify\"");
    expect(route).toContain("action === \"share\"");
    expect(dashboard).toContain('data-testid="client-daily-card"');
    expect(events).toContain("Практики ясности");
    expect(delivery).toContain("case \"DAILY_CARD\"");
  });

  it("keeps milestones gentle and non-coercive", () => {
    const dashboard = source("src/app/cabinet/page.tsx");

    expect(dashboard).toContain('data-testid="client-gentle-milestones"');
    expect(dashboard).toContain("Мягкий ритм");
    expect(dashboard).toContain("нет штрафов, дедлайнов и давления");
    expect(dashboard).toContain("db.dailyCard.count");
  });

  it("lets users export allowed personal data before account deletion", () => {
    const route = source("src/app/api/auth/export-data/route.ts");
    const settings = source("src/app/cabinet/settings/settings-client.tsx");

    expect(route).toContain("db.dialogue.findMany");
    expect(route).toContain("db.productResult.findMany");
    expect(route).toContain("db.clarityRoute.findMany");
    expect(route).toContain("db.dailyCard.findMany");
    expect(route).toContain("eterapy-personal-data.json");
    expect(settings).toContain("/api/auth/export-data");
    expect(settings).toContain("Экспорт личных данных");
    expect(settings).toContain("Удаление аккаунта");
  });

  it("tracks retention actions through the global analytics listener", () => {
    const analytics = source("src/components/analytics.tsx");
    const dashboard = source("src/app/cabinet/page.tsx");
    const map = source("src/app/cabinet/action-history/page.tsx");

    expect(analytics).toContain("[data-analytics-event]");
    expect(analytics).toContain("eterapy:analytics");
    expect(analytics).toContain("track({");
    expect(analytics).toContain("analyticsDialogueId");
    expect(analytics).toContain("analyticsOfferReason");
    expect(analytics).toContain("analyticsCreditCost");
    expect(dashboard).toContain("daily_card_question_clicked");
    expect(dashboard).toContain("daily_card_share_clicked");
    expect(map).toContain("my_map_export_clicked");
    expect(map).toContain("my_map_share_clicked");
    expect(map).toContain("my_map_hide_clicked");
    expect(map).toContain("my_map_delete_clicked");
  });
});
