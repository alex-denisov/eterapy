import fs from "node:fs";
import path from "node:path";

const source = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("Y10 Z9 — My Map routes to real action history", () => {
  it("M26/B369: старый /cabinet/map выпилен без редиректа", () => {
    expect(fs.existsSync(path.join(process.cwd(), "src/app/cabinet/map"))).toBe(false);
  });

  it("surfaces Dialogue.topic as a real map topic instead of hiding it in mock chips", () => {
    const helper = source("src/lib/diary.ts");
    const page = source("src/app/cabinet/diary/page.tsx");

    expect(helper).toContain("topicLabel?: string");
    expect(helper).toContain("topic: dialogue.topic ?? \"other\"");
    expect(helper).toContain("topicLabel: dialogueTopicLabelRu(dialogue.topic)");
    expect(page).toContain("dialogueTopicCounts");
    expect(page).toContain('data-testid="diary-dialogue-topics"');
    expect(page).toContain("data-topic-key={topic.value}");
  });
});
