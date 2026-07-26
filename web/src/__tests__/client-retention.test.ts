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
    expect(page).toContain('data-testid="client-primary-action"');
    expect(page).toContain('data-testid="client-recent-questions"');
    expect(page).toContain("db.dialogue.count");
    expect(page).toContain("db.productResult.count");
    expect(page).toContain("db.userSubscription.findFirst");
    expect(page).toContain('data-testid="client-subscription-status"');
    expect(page).toContain("getSubscriptionPlanLabel");
    expect(page).toContain("db.clarityRoute.findMany");
    // B464 item 1: «Все разборы» now points at /diary (the full разборы list +
    // hidden-item restore live there), not the orphan /questions page.
    expect(page).toContain('appUrl("/diary")');
    // B464 IB1: the cabinet home shows a single «ваши результаты» block with an
    // "Все разборы →" link to the history page. The previously duplicated
    // in-page "История разборов" card was removed (the sidebar nav keeps that
    // label — see the cabinet-shell assertion below).
    expect(page).toContain("ваши результаты");
    expect(page).toContain("Все разборы");
    expect(page).not.toContain("История разборов");
    expect(page).toContain("mainUrl(`/checkin?dialogueId=${d.id}`)");
  });

  it("adds v4.1 history navigation to the cabinet", () => {
    const shell = source("src/components/cabinet/cabinet-shell.tsx");

    // M26/B369: «История разборов» слита с «Моей картой» в один пункт «Дневник».
    expect(shell).toContain('appUrl("/diary")');
    expect(shell).toContain('"Дневник"');
    expect(shell).toContain('appUrl("/wallet")');
    expect(shell).not.toContain('appUrl("/practice")');
    expect(shell).toContain('"Кошелёк"');
    expect(shell).toContain("BookOpen");
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
    const checkin = source("src/components/dialogue/checkin-experience.tsx");

    expect(checkin).toContain("dialogueId");
    expect(checkin).toContain("fetch(`/api/dialogues/${dialogueId}`");
    expect(checkin).toContain("Восстанавливаю сохраненный диалог");
    expect(checkin).toContain('setPhase("result")');
    expect(checkin).toContain('setPhase("clarifying")');
    expect(checkin).toContain('setPhase("safety")');
  });

  it("keeps action history on the existing modalities history API", () => {
    const page = source("src/app/cabinet/diary/page.tsx");

    expect(page).not.toContain("/api/ai/history");
  });

  it("implements the diary as a unified save, hide, delete, and share surface", () => {
    const page = source("src/app/cabinet/diary/page.tsx");
    const helper = source("src/lib/diary.ts");
    // B512 §3.5: the share affordance is the shared result-moment share/gift
    // menu (anonymized /share link + gift-a-разбор), same as the Главная rows.
    const shareAction = source("src/components/cabinet/result-share-action.tsx");

    expect(page).toContain('data-testid="diary-page"');
    expect(page).toContain('data-testid="diary-items"');
    expect(page).toContain("listDiaryItems");
    expect(page).toContain("async function hideMapItem");
    expect(page).toContain("async function deleteMapItem");
    expect(page).toContain("async function saveMapItem");
    expect(page).toContain("hiddenFromMap");
    expect(page).toContain("ResultShareAction");
    expect(shareAction).toContain("/share?from=");
    expect(page).toContain('status: "DELETED"');
    expect(page).toContain('status: "CANCELLED"');
    expect(helper).toContain("db.dialogue.findMany");
    expect(helper).toContain("db.productResult.findMany");
    expect(helper).toContain("db.clarityRoute.findMany");
    expect(helper).toContain("isHiddenFromDiary");
    // B512 R1-7: все READY-разборы автосохраняются в Дневник — ручного
    // savedAt-фильтра больше нет.
    expect(helper).not.toContain("savedAt: { not: null }");
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
    expect(events).toContain("Ежедневная практика");
    expect(delivery).toContain("case \"DAILY_CARD\"");
  });

  it("keeps milestones gentle and non-coercive", () => {
    const dashboard = source("src/app/cabinet/page.tsx");

    // B464 IB1: vanity «Мягкий ритм» counts folded into a single non-shaming
    // streak badge; the daily ritual stays free and pressure-free.
    expect(dashboard).toContain('data-testid="client-streak-badge"');
    expect(dashboard).toContain("их видите только вы");
    expect(dashboard).not.toContain("Мягкий ритм");
    expect(dashboard).not.toContain('data-testid="client-gentle-milestones"');
  });

  it("keeps the B376 cabinet dashboard to one primary action and one points balance", () => {
    const dashboard = source("src/app/cabinet/page.tsx");

    expect(dashboard).toContain('data-testid="client-primary-action"');
    expect(dashboard.indexOf('data-testid="client-primary-action"')).toBeLessThan(
      dashboard.indexOf('data-testid="client-map-preview"'),
    );
    expect(dashboard).toContain('data-testid="client-dashboard-balance"');
    expect(dashboard).toContain('<details className="soft-card mb-4 p-5" data-testid="client-first-steps"');
    expect(dashboard).toContain("open={false}");
    expect(dashboard).not.toContain('data-testid="client-clarity-credits"');
    expect(dashboard).not.toContain("<p className=\"font-heading text-3xl\" style={{ color: \"var(--soft-bordeaux)\" }}>{clarityCredits}</p>");
    expect(dashboard).not.toContain("Начать маршрут");
    expect(dashboard).not.toContain("маршрут «7 дней»");
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
    const map = source("src/app/cabinet/diary/page.tsx");

    expect(analytics).toContain("[data-analytics-event]");
    // B586: имя события уехало в константу (`lib/analytics-events.ts`) — его
    // слушает счётчик, а отправляют страницы, и строковый литерал в двух местах
    // однажды уже разъехался. Проверяем и подписку, и само имя в его источнике.
    expect(analytics).toContain("window.addEventListener(ANALYTICS_EVENT");
    expect(source("src/lib/analytics-events.ts")).toContain('"eterapy:analytics"');
    expect(analytics).toContain("track({");
    expect(analytics).toContain("analyticsDialogueId");
    expect(analytics).toContain("analyticsOfferReason");
    expect(analytics).toContain("analyticsCreditCost");
    // B464 IB1: the dashboard daily-Q now drives the in-cabinet reflect flow
    // (DailyPracticeActions) instead of the two old «Разобрать/Поделиться»
    // buttons, so those two analytics events moved off the dashboard.
    // B512 §3.5: share analytics now fire from the shared share/gift menu
    // (result_share_clicked / result_gift_clicked with the my_map surface).
    const shareAction = source("src/components/cabinet/result-share-action.tsx");
    expect(shareAction).toContain("result_share_clicked");
    expect(shareAction).toContain("result_gift_clicked");
    expect(map).toContain('surface="my_map"');
    expect(map).toContain("my_map_hide_clicked");
    expect(map).toContain("my_map_delete_clicked");
  });
});
