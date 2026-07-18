import fs from "node:fs";
import path from "node:path";

/**
 * GitHub Actions rejects a workflow with duplicate mapping keys ("workflow
 * file issue", the run fails at 0s with no jobs) — but a permissive YAML
 * parser silently keeps the last value. A duplicate `steps:` slipped into
 * deploy-staging.yml this way and broke every staging run while prod kept
 * alerting green. This guard fails fast in CI instead.
 */
const workflowsDir = path.resolve(process.cwd(), "..", ".github", "workflows");

/** Find duplicate keys within any single mapping block, respecting indentation. */
function findDuplicateKeys(yamlText: string): string[] {
  const dupes: string[] = [];
  // Stack of {indent, seen} for the mapping at each indentation level.
  const stack: Array<{ indent: number; seen: Set<string> }> = [];
  const lines = yamlText.split("\n");
  for (const raw of lines) {
    const line = raw.replace(/\t/g, "  ");
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const indent = line.length - line.trimStart().length;
    const match = /^(\s*)([A-Za-z0-9_.-]+):(\s|$)/.exec(line);
    if (line.trimStart().startsWith("- ")) {
      // list item — drop deeper mapping scopes
      while (stack.length && stack[stack.length - 1].indent > indent) stack.pop();
      continue;
    }
    if (!match) continue;
    const key = match[2];
    while (stack.length && stack[stack.length - 1].indent > indent) stack.pop();
    if (!stack.length || stack[stack.length - 1].indent < indent) {
      stack.push({ indent, seen: new Set() });
    }
    const top = stack[stack.length - 1];
    if (top.indent === indent) {
      if (top.seen.has(key)) dupes.push(key);
      top.seen.add(key);
    }
  }
  return dupes;
}

describe("GitHub Actions workflows", () => {
  const files = fs
    .readdirSync(workflowsDir)
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));

  it.each(files)("%s has no duplicate mapping keys", (file) => {
    const text = fs.readFileSync(path.join(workflowsDir, file), "utf8");
    expect(findDuplicateKeys(text)).toEqual([]);
  });
});
