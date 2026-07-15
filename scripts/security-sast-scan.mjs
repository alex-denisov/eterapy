#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const trackedFiles = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .filter((file) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file))
  .filter((file) => !file.includes("node_modules/"))
  .filter((file) => !file.includes("__tests__/"))
  .filter((file) => !file.includes("/e2e/"));

const rules = [
  { id: "js-eval", regex: /\beval\s*\(/ },
  { id: "js-new-function", regex: /\bnew\s+Function\s*\(/ },
  { id: "html-innerHTML", regex: /\.innerHTML\s*=/ },
  { id: "react-dangerous-html", regex: /\bdangerouslySetInnerHTML\b/ },
  { id: "prisma-raw-unsafe", regex: /\$queryRawUnsafe\b/ },
];

const allowlist = new Set([
  // Scanner self-test pattern definitions, not executable raw-query usage.
  "scripts/security-sast-scan.mjs:prisma-raw-unsafe",
  // Public SEO JSON-LD scripts serialize trusted static data through JSON.stringify.
  "web/src/app/library/[slug]/page.tsx:react-dangerous-html",
  "web/src/components/analytics.tsx:react-dangerous-html",
  "web/src/components/seo/public-json-ld.tsx:react-dangerous-html",
  "web/src/app/help/page.tsx:react-dangerous-html",
  "web/src/components/landing/authority-article.tsx:react-dangerous-html",
  // The SVG template is static; injected style values are bounded numeric gates
  // and enum-indexed center/color constants produced by the deterministic chart.
  "web/src/components/products/human-design-bodygraph.tsx:react-dangerous-html",
]);

const findings = [];

for (const file of trackedFiles) {
  if (!existsSync(file)) continue;
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    for (const rule of rules) {
      if (!rule.regex.test(line)) continue;
      const key = `${file}:${rule.id}`;
      if (allowlist.has(key)) continue;
      findings.push({ file, line: index + 1, rule: rule.id });
    }
  }
}

if (findings.length > 0) {
  console.error("SAST scan failed. Findings:");
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} ${finding.rule}`);
  }
  process.exit(1);
}

console.log("SAST scan passed: no high-confidence unsafe patterns found.");
