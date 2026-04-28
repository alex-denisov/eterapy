#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const failOnArg = process.argv.find((arg) => arg.startsWith("--fail-on="));
const failOn = failOnArg?.split("=")[1] ?? null;
const severityRank = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

const audit = spawnSync("npm", ["audit", "--workspace", "web", "--json"], {
  encoding: "utf8",
  shell: false,
});

const output = audit.stdout || audit.stderr;
if (!output) {
  console.error("npm audit produced no output");
  process.exit(1);
}

let report;
try {
  report = JSON.parse(output);
} catch {
  console.error(output);
  process.exit(audit.status ?? 1);
}

const counts = report.metadata?.vulnerabilities ?? {};
const vulnerabilities = Object.values(report.vulnerabilities ?? {});

console.log("Dependency audit summary:");
console.log(`- total: ${counts.total ?? 0}`);
console.log(`- critical: ${counts.critical ?? 0}`);
console.log(`- high: ${counts.high ?? 0}`);
console.log(`- moderate: ${counts.moderate ?? 0}`);
console.log(`- low: ${counts.low ?? 0}`);

for (const vulnerability of vulnerabilities) {
  const via = Array.isArray(vulnerability.via)
    ? vulnerability.via.map((entry) => typeof entry === "string" ? entry : entry.title).join("; ")
    : String(vulnerability.via ?? "");
  const fix = vulnerability.fixAvailable
    ? typeof vulnerability.fixAvailable === "object"
      ? `${vulnerability.fixAvailable.name}@${vulnerability.fixAvailable.version}`
      : "available"
    : "none";
  console.log(`- ${vulnerability.name} [${vulnerability.severity}] fix: ${fix} via: ${via}`);
}

if (failOn) {
  const threshold = severityRank[failOn];
  if (threshold === undefined) {
    console.error(`Unknown severity threshold: ${failOn}`);
    process.exit(2);
  }
  const hasBlockingFinding = vulnerabilities.some((vulnerability) =>
    severityRank[vulnerability.severity] >= threshold
  );
  if (hasBlockingFinding) {
    process.exit(1);
  }
}
