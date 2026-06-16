import fs from "node:fs";
import path from "node:path";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("W16 — dialogue result actions: rename + calmer hierarchy", () => {
  it("the share button is no longer labelled «инсайт»", () => {
    const share = read("src/components/ai-share-button.tsx");
    expect(share).not.toContain("Поделиться инсайтом");
    expect(share).toContain("поделиться разбором");
  });
  it("the result cluster has one primary (save) and drops the duplicated upsells", () => {
    const page = read("src/app/checkin/page.tsx");
    // B414: authed users auto-save (no button) — the action cluster shows the note
    expect(page).toContain('data-testid="result-autosaved-note"');
    // circle/pair upsells removed from the action cluster (they live in the rail)
    expect(page).not.toContain('data-testid="dialogue-free-circle"');
    expect(page).not.toContain('data-testid="dialogue-free-pair"');
  });
});
