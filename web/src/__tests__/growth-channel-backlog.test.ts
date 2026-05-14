import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const repoRoot = path.resolve(root, "..");

function doc(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("B216 growth channel backlog", () => {
  it("plans VK, embedded, share/native triggers, and PMF gates with risk controls", () => {
    const backlog = doc("docs/v5-release/11-GROWTH-CHANNEL-BACKLOG.md");
    const blocks = doc("docs/v5-release/02-BLOCKS.md");

    expect(backlog).toContain("VK Mini App And VK Community");
    expect(backlog).toContain("Embedded Widgets");
    expect(backlog).toContain("Share Extension And Browser Extension");
    expect(backlog).toContain("Native App Triggers");
    expect(backlog).toContain("Post-PMF Channel Gates");
    expect(backlog).toContain("source=vk_community");
    expect(backlog).toContain("source=share_extension");
    expect(backlog).toContain("ChannelAttribution");
    expect(backlog).toContain("Risk controls");
    expect(backlog).toContain("Launch gates");
    expect(backlog).toContain("Do not promote a channel when");
    expect(blocks).toContain("B216");
    expect(blocks).toContain("VK/community and embedded growth backlog");
  });
});
