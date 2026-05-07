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
    expect(page).toContain("db.clarityRoute.findMany");
    expect(page).toContain('appUrl("/cabinet/questions")');
    expect(page).toContain("mainUrl(`/checkin?dialogueId=${recentDialogues[0].id}`)");
  });

  it("adds My Questions to the cabinet navigation", () => {
    const shell = source("src/components/cabinet/cabinet-shell.tsx");

    expect(shell).toContain('appUrl("/cabinet/questions")');
    expect(shell).toContain('"Мои вопросы"');
    expect(shell).toContain("MessageCircle");
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
});
