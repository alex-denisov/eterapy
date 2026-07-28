#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_LIMIT = 20;
const DEFAULT_POLL_MS = 10_000;
const RUN_FIELDS = [
  "databaseId",
  "headBranch",
  "headSha",
  "status",
  "conclusion",
  "workflowName",
  "createdAt",
  "url",
].join(",");

const HELP = `ETerapy GitHub Actions monitor

Usage:
  node scripts/ci_monitor.cjs --help
  node scripts/ci_monitor.cjs runs [--branch <name>] [--limit <count>]
  node scripts/ci_monitor.cjs watch <run-id>
  node scripts/ci_monitor.cjs fail-fast <run-id>
  node scripts/ci_monitor.cjs log-failed <run-id>
  node scripts/ci_monitor.cjs test-summary <run-id>
  node scripts/ci_monitor.cjs check-actions [workflow-file]
  node scripts/ci_monitor.cjs grep <run-id> --pattern <regex>
  node scripts/ci_monitor.cjs wait-for <run-id> <job-name> --keyword <text>

Environment:
  CI_MONITOR_POLL_MS   Poll interval for wait-for (default: 10000)
  CI_MONITOR_GH_BIN    Override gh binary for tests only
`;

function fail(message, code = 2) {
  const error = new Error(message);
  error.exitCode = code;
  throw error;
}

function validateRunId(value) {
  if (!/^[1-9]\d*$/.test(value ?? "")) {
    fail(`Invalid run id: ${value ?? "<missing>"}`);
  }
  return value;
}

function positiveInteger(value, label) {
  if (!/^[1-9]\d*$/.test(value ?? "")) fail(`${label} must be a positive integer`);
  return Number(value);
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) fail(`${name} requires a value`);
  return value;
}

function gh(args, { capture = false, allowFailure = false } = {}) {
  const binary = process.env.CI_MONITOR_GH_BIN || "gh";
  const result = spawnSync(binary, args, {
    encoding: "utf8",
    env: { ...process.env, GH_PAGER: "cat", NO_COLOR: "1" },
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error) fail(`Cannot run ${binary}: ${result.error.message}`, 1);
  if (result.status !== 0 && !allowFailure) {
    if (capture && result.stderr) process.stderr.write(result.stderr);
    fail(`gh exited with status ${result.status}`, result.status || 1);
  }
  return result;
}

function renderRuns(raw) {
  let runs;
  try {
    runs = JSON.parse(raw);
  } catch {
    fail("gh returned invalid JSON", 1);
  }
  if (!Array.isArray(runs) || runs.length === 0) return "No workflow runs found.\n";
  return `${runs.map((run) => [
    String(run.databaseId),
    run.status,
    run.conclusion || "—",
    run.workflowName,
    String(run.headSha || "").slice(0, 8),
    run.createdAt,
    run.url,
  ].join("\t")).join("\n")}\n`;
}

function parseTestSummary(log) {
  const useful = [];
  const patterns = [
    /^Test Suites:\s+.*$/gm,
    /^Tests:\s+.*$/gm,
    /^Snapshots:\s+.*$/gm,
    /^Time:\s+.*$/gm,
    /^\s*\d+\s+(?:passed|failed|skipped)(?:\s+\(\d+(?:\.\d+)?[ms]+\))?\s*$/gim,
    /^\s*\d+\s+tests?\s+(?:passed|failed|skipped).*$/gim,
  ];
  for (const pattern of patterns) {
    for (const match of log.matchAll(pattern)) useful.push(match[0].trim());
  }
  return [...new Set(useful)];
}

function workflowFiles(target) {
  if (target) {
    const resolved = path.resolve(target);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      fail(`Workflow file not found: ${target}`);
    }
    return [resolved];
  }
  const directory = path.resolve(".github/workflows");
  if (!fs.existsSync(directory)) fail(".github/workflows not found");
  return fs.readdirSync(directory)
    .filter((name) => /\.ya?ml$/i.test(name))
    .sort()
    .map((name) => path.join(directory, name));
}

function collectActionRefs(files) {
  const refs = [];
  for (const file of files) {
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      const match = line.match(/^\s*-\s+uses:\s*([^\s#]+)/);
      if (!match) return;
      const value = match[1].replace(/^["']|["']$/g, "");
      const at = value.lastIndexOf("@");
      refs.push({
        file,
        line: index + 1,
        action: at > 0 ? value.slice(0, at) : value,
        ref: at > 0 ? value.slice(at + 1) : "",
        pinned: at > 0 && /^[0-9a-f]{40}$/i.test(value.slice(at + 1)),
      });
    });
  }
  return refs;
}

function runStatus(runId) {
  const result = gh([
    "run", "view", runId,
    "--json", "status,conclusion,jobs,url,headSha,workflowName",
  ], { capture: true });
  try {
    return JSON.parse(result.stdout);
  } catch {
    fail("gh returned invalid run JSON", 1);
  }
}

function sleep(milliseconds) {
  const buffer = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(buffer), 0, 0, milliseconds);
}

function commandRuns(args) {
  const branch = option(args, "--branch");
  const limit = option(args, "--limit");
  const ghArgs = ["run", "list", "--limit", String(limit ? positiveInteger(limit, "--limit") : DEFAULT_LIMIT), "--json", RUN_FIELDS];
  if (branch) ghArgs.push("--branch", branch);
  const result = gh(ghArgs, { capture: true });
  process.stdout.write(renderRuns(result.stdout));
}

function commandWatch(runId) {
  gh(["run", "watch", validateRunId(runId), "--interval", "10", "--exit-status"]);
}

function commandLogFailed(runId) {
  gh(["run", "view", validateRunId(runId), "--log-failed"]);
}

function commandTestSummary(runId) {
  const result = gh(["run", "view", validateRunId(runId), "--log"], { capture: true });
  const summary = parseTestSummary(result.stdout);
  if (summary.length === 0) {
    const state = runStatus(runId);
    process.stdout.write(`${state.workflowName}: ${state.status}/${state.conclusion || "—"}\n`);
    for (const job of state.jobs ?? []) {
      process.stdout.write(`${job.name}: ${job.status}/${job.conclusion || "—"}\n`);
    }
    return;
  }
  process.stdout.write(`${summary.join("\n")}\n`);
}

function commandCheckActions(target) {
  const refs = collectActionRefs(workflowFiles(target));
  if (refs.length === 0) {
    process.stdout.write("No action references found.\n");
    return;
  }
  for (const ref of refs) {
    const relative = path.relative(process.cwd(), ref.file);
    const policy = ref.action.startsWith("./") || ref.action.startsWith("docker://")
      ? "local"
      : ref.pinned
        ? "sha-pinned"
        : /^v\d+(?:\.\d+)*$/.test(ref.ref)
          ? "version-tag"
          : "mutable-ref";
    process.stdout.write(`${relative}:${ref.line}\t${ref.action}@${ref.ref || "<missing>"}\t${policy}\n`);
  }
}

function commandGrep(runId, args) {
  const source = option(args, "--pattern");
  if (!source) fail("--pattern is required");
  let pattern;
  try {
    pattern = new RegExp(source, "i");
  } catch (error) {
    fail(`Invalid regex: ${error.message}`);
  }
  const result = gh(["run", "view", validateRunId(runId), "--log"], { capture: true });
  const matches = result.stdout.split(/\r?\n/).filter((line) => pattern.test(line));
  if (matches.length === 0) {
    process.stdout.write("No matching log lines.\n");
    return;
  }
  process.stdout.write(`${matches.join("\n")}\n`);
}

function commandWaitFor(runId, jobName, args) {
  validateRunId(runId);
  if (!jobName) fail("wait-for requires a job name");
  const keyword = option(args, "--keyword");
  if (!keyword) fail("--keyword is required");
  const pollMs = positiveInteger(process.env.CI_MONITOR_POLL_MS || String(DEFAULT_POLL_MS), "CI_MONITOR_POLL_MS");

  while (true) {
    const state = runStatus(runId);
    const jobs = state.jobs ?? [];
    const exact = jobs.find((job) => job.name === jobName);
    const partial = jobs.filter((job) => job.name.toLowerCase().includes(jobName.toLowerCase()));
    const job = exact ?? (partial.length === 1 ? partial[0] : null);
    if (!job) {
      if (state.status === "completed") fail(`Job not found: ${jobName}`, 1);
      process.stdout.write(`waiting\tjob-not-created\t${jobName}\n`);
      sleep(pollMs);
      continue;
    }
    process.stdout.write(`${job.status}\t${job.conclusion || "—"}\t${job.name}\n`);
    if (job.status !== "completed") {
      sleep(pollMs);
      continue;
    }
    if (job.conclusion !== "success") fail(`Job failed: ${job.name} (${job.conclusion})`, 1);
    const log = gh(["run", "view", runId, "--job", String(job.databaseId), "--log"], { capture: true }).stdout;
    if (!log.includes(keyword)) fail(`Keyword not found in successful job: ${keyword}`, 1);
    process.stdout.write(`matched\t${keyword}\t${state.url}\n`);
    return;
  }
}

function main(argv = process.argv.slice(2)) {
  const [command, first, second, ...rest] = argv;
  if (!command || command === "--help" || command === "-h" || command === "help") {
    process.stdout.write(HELP);
    return;
  }
  if (command === "runs") return commandRuns(argv.slice(1));
  if (command === "watch" || command === "fail-fast") return commandWatch(first);
  if (command === "log-failed") return commandLogFailed(first);
  if (command === "test-summary") return commandTestSummary(first);
  if (command === "check-actions") return commandCheckActions(first);
  if (command === "grep") return commandGrep(first, argv.slice(2));
  if (command === "wait-for") return commandWaitFor(first, second, rest);
  fail(`Unknown command: ${command}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`ci-monitor: ${error.message}\n`);
    process.exitCode = error.exitCode || 1;
  }
}

module.exports = {
  HELP,
  collectActionRefs,
  main,
  parseTestSummary,
  renderRuns,
  validateRunId,
};
