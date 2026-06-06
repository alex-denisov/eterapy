import fs from "node:fs";
import path from "node:path";

const source = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("Y10 Z9 — My Map routes to real action history", () => {
  it("redirects the old /cabinet/map mock to the real action-history surface", () => {
    const page = source("src/app/cabinet/map/page.tsx");

    expect(page).toContain('redirect("/cabinet/action-history")');
    expect(page).not.toContain("Центральный инсайт месяца");
    expect(page).not.toContain("Сценарий «Близость»");
    expect(page).not.toContain("Границы\", \"Работа\", \"Самооценка");
  });

  it("surfaces Dialogue.topic as a real map topic instead of hiding it in mock chips", () => {
    const helper = source("src/lib/my-map.ts");
    const page = source("src/app/cabinet/action-history/page.tsx");

    expect(helper).toContain("topicLabel?: string");
    expect(helper).toContain("topic: dialogue.topic ?? \"other\"");
    expect(helper).toContain("topicLabel: dialogueTopicLabelRu(dialogue.topic)");
    expect(page).toContain("dialogueTopicCounts");
    expect(page).toContain('data-testid="my-map-dialogue-topics"');
    expect(page).toContain("data-topic-key={topic.value}");
  });
});
