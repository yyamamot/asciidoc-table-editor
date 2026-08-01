#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const options = parseArgs(process.argv.slice(2));

if (options.help) {
  printUsage(0);
}

const requiredCommands = [
  ["pnpm", ["run", "verify"], "release baseline verify"],
  ["pnpm", ["run", "test:integration:host", "--", "--target", "minimum"], "minimum VS Code Host integration"],
  ["pnpm", ["run", "test:package"], "VSIX/package smoke"],
  ["pnpm", ["run", "check:asciidoctor-compat"], "Asciidoctor compatibility"],
  ["pnpm", ["run", "perf:large-table"], "large table performance"],
  ["pnpm", ["run", "perf:codelens"], "CodeLens table detection performance"],
  ["pnpm", ["run", "review:ui:llm"], "standard UI/VLM review matrix"]
];

for (const [command, args, label] of requiredCommands) {
  runRequired(command, args, label);
}

if (options.visual) {
  const visualScenarios = [
    "fixtures/harness/table-grid-smoke/scenario.json",
    "fixtures/harness/preview-comprehensive/scenario.json"
  ];
  for (const scenarioPath of visualScenarios) {
    runRequired(
      "pnpm",
      ["run", "test:nightly:visual"],
      `nightly visual screenshot: ${scenarioPath}`,
      {
        ...process.env,
        ASCIIDOC_TABLE_RUN_NIGHTLY_VISUAL: "1",
        ASCIIDOC_TABLE_NIGHTLY_SCENARIO_PATH: scenarioPath
      }
    );
  }
}

const latestReviewPack = findLatestReviewPack();
if (latestReviewPack) {
  const reportPath = join(latestReviewPack, "ui-review-report.json");
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  if (report.result !== "pass") {
    console.error(`Release UI review did not pass: ${report.result}`);
    console.error(`UI review pack: ${latestReviewPack}`);
    process.exit(1);
  }
  console.log("");
  console.log(`release UI review pack: ${latestReviewPack}`);
}

console.log("");
console.log("release regression result: pass");

function parseArgs(args) {
  const parsed = { visual: false, help: false };
  for (const arg of args) {
    if (arg === "--") {
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (arg === "--visual") {
      parsed.visual = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function runRequired(command, args, label, env = process.env) {
  console.log(`\n[release:regression] ${label}`);
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env,
    stdio: "inherit"
  });
  if (result.status !== 0) {
    console.error(`[release:regression] ${label} failed with exit code ${result.status ?? 1}.`);
    process.exit(result.status ?? 1);
  }
}

function findLatestReviewPack() {
  const reviewRoot = join(root, ".tmp", "ui-review-pack");
  if (!existsSync(reviewRoot)) {
    return undefined;
  }
  const result = spawnSync("find", [reviewRoot, "-maxdepth", "2", "-name", "ui-review-report.json", "-print"], {
    cwd: root,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    return undefined;
  }
  const reports = result.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .sort();
  const latestReport = reports.at(-1);
  return latestReport ? latestReport.replace(/\/ui-review-report\.json$/u, "") : undefined;
}

function printUsage(exitCode) {
  console.log([
    "Usage: pnpm run release:regression -- [--visual]",
    "",
    "Runs the release candidate regression gates:",
    "  verify, test:package, check:asciidoctor-compat, perf:large-table, perf:codelens, review:ui:llm",
    "",
    "Options:",
    "  --visual  also run Extension Development Host screenshot scenarios for table-grid and preview-comprehensive"
  ].join("\n"));
  process.exit(exitCode);
}
