#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { sha256, validateEvidenceManifest } from "./ui-model-review.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);
const options = parseArgs(process.argv.slice(2));

if (options.help) {
  printUsage(0);
}

const deterministicReviewEnv = options.requireModelReview
  ? { ...process.env, ASCIIDOC_TABLE_MODEL_REVIEW_POLICY: "required" }
  : process.env;
const requiredCommands = [
  ["pnpm", ["run", "verify"], "release baseline verify"],
  ["pnpm", ["run", "test:integration:host", "--", "--target", "minimum"], "minimum VS Code Host integration"],
  ["pnpm", ["run", "test:package"], "VSIX/package smoke"],
  ["pnpm", ["run", "check:asciidoctor-compat"], "Asciidoctor compatibility"],
  ["pnpm", ["run", "perf:large-table"], "large table performance"],
  ["pnpm", ["run", "perf:codelens"], "CodeLens table detection performance"],
  ["pnpm", ["run", "review:ui:deterministic"], "deterministic UI review matrix", deterministicReviewEnv]
];

for (const [command, args, label, env] of requiredCommands) {
  runRequired(command, args, label, env);
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
    console.error(`Release deterministic UI review did not pass: ${report.result}`);
    console.error(`UI review pack: ${latestReviewPack}`);
    process.exit(1);
  }
  const modelReviewPath = join(latestReviewPack, "model-ui-review.json");
  if (!existsSync(modelReviewPath)) {
    console.log("release model UI review status: not-run (optional)");
    if (options.requireModelReview) {
      console.error(`Required model UI review artifact was not found: ${modelReviewPath}`);
      process.exit(1);
    }
  } else {
    const modelReview = JSON.parse(readFileSync(modelReviewPath, "utf8"));
    console.log(`release model UI review status: ${String(modelReview.status ?? "blocked")} (${String(modelReview.policy ?? "optional")})`);
    if (options.requireModelReview && !isPassingRequiredModelReview(modelReview, report, latestReviewPack)) {
      console.error(`Required model UI review did not pass: ${String(modelReview.status ?? "blocked")}`);
      console.error(`Model UI review artifact: ${modelReviewPath}`);
      process.exit(1);
    }
  }
  console.log("");
  console.log(`release UI review pack: ${latestReviewPack}`);
}

console.log("");
console.log("release regression result: pass");

function isPassingRequiredModelReview(modelReview, report, reviewRoot) {
  const sha256Pattern = /^[a-f0-9]{64}$/u;
  const safeToken = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
  const expectedIds = new Set((report?.scenarioResults ?? []).flatMap((scenario) => (scenario.checks ?? [])
    .filter((check) => check.provenance === "model-derived-review")
    .map((check) => String(check.id).replace(/^assertion-/u, ""))));
  const assertions = modelReview?.response?.assertions;
  if (!Array.isArray(assertions) || Object.keys(modelReview.response).length !== 1) return false;
  const actualIds = new Set();
  for (const assertion of assertions) {
    if (typeof assertion !== "object" || assertion === null || Array.isArray(assertion) ||
        Object.keys(assertion).sort().join(",") !== "id,result" || typeof assertion.id !== "string" ||
        assertion.id.length === 0 || actualIds.has(assertion.id) || assertion.result !== "pass") return false;
    actualIds.add(assertion.id);
  }
  const promptPath = join(reviewRoot, "ui-review-prompt.md");
  const manifestPath = join(reviewRoot, "evidence-manifest.json");
  if (!existsSync(promptPath) || !existsSync(manifestPath)) return false;
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return false;
  }
  const hashesMatch = sha256(readFileSync(promptPath)) === modelReview.promptHash &&
    manifest.evidenceHash === modelReview.evidenceHash &&
    validateEvidenceManifest({ workspaceRoot: root, reviewRoot, manifest });
  return hashesMatch && actualIds.size === expectedIds.size && [...actualIds].every((id) => expectedIds.has(id)) &&
    modelReview?.reviewerKind === "model" &&
    modelReview.policy === "required" &&
    modelReview.status === "pass" &&
    modelReview.result === "pass" &&
    typeof modelReview.provider === "string" && safeToken.test(modelReview.provider) &&
    typeof modelReview.model === "string" && safeToken.test(modelReview.model) &&
    typeof modelReview.promptHash === "string" && sha256Pattern.test(modelReview.promptHash) &&
    typeof modelReview.evidenceHash === "string" && sha256Pattern.test(modelReview.evidenceHash);
}

function parseArgs(args) {
  const parsed = { visual: false, requireModelReview: false, help: false };
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
    if (arg === "--require-model-review") {
      parsed.requireModelReview = true;
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
    "Usage: pnpm run release:regression -- [--visual] [--require-model-review]",
    "",
    "Runs the release candidate regression gates:",
    "  verify, test:package, check:asciidoctor-compat, perf:large-table, perf:codelens, review:ui:deterministic",
    "",
    "Options:",
    "  --visual               also run Extension Development Host screenshot scenarios for table-grid and preview-comprehensive",
    "  --require-model-review require a valid passing provider-neutral model review response"
  ].join("\n"));
  process.exit(exitCode);
}
