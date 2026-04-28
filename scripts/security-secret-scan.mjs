#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const trackedFiles = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);

const sensitiveFilePatterns = [
  /(^|\/)\.env($|\.)/,
  /(^|\/)deploy\/eTerapy_web$/,
  /(^|\/)certs\/key\.pem$/,
  /(^|\/)certificates\/.*private.*\.key$/i,
  /\.(p12|pfx|jks)$/i,
];

const contentPatterns = [
  { name: "private-key", regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "openai-key", regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/ },
  { name: "anthropic-key", regex: /\bsk-ant-[A-Za-z0-9_-]{32,}\b/ },
  { name: "telegram-bot-token", regex: /\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/ },
  { name: "yookassa-live-secret", regex: /\blive_[A-Za-z0-9_-]{24,}\b/ },
];

const ignoredPaths = new Set([
  "package-lock.json",
  "web/package-lock.json",
]);

const findings = [];

for (const file of trackedFiles) {
  if (!existsSync(file)) continue;
  if (ignoredPaths.has(file)) continue;

  for (const pattern of sensitiveFilePatterns) {
    if (pattern.test(file)) {
      findings.push({ file, line: 1, type: "sensitive-filename" });
    }
  }

  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  const lines = content.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    for (const pattern of contentPatterns) {
      if (pattern.regex.test(line)) {
        findings.push({ file, line: index + 1, type: pattern.name });
      }
    }
  }
}

if (findings.length > 0) {
  console.error("Secret scan failed. Findings:");
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} ${finding.type}`);
  }
  process.exit(1);
}

console.log("Secret scan passed: no tracked secret patterns found.");
