#!/usr/bin/env node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { checkCoverageInventory, checkCoverageSummary } from "./coverage-report.mjs";

const reportRoot = resolve("coverage/extension");
const rawCoverageRoot = mkdtempSync(resolve(tmpdir(), "ate-extension-coverage-"));
rmSync(reportRoot, { recursive: true, force: true });

try {
  run("pnpm", ["run", "test:integration:host", "--", "--target", "current"], {
    ...process.env,
    ASCIIDOC_TABLE_SOURCEMAP: "1",
    NODE_V8_COVERAGE: rawCoverageRoot
  });
  run("pnpm", [
    "exec",
    "c8",
    "report",
    "--temp-directory",
    rawCoverageRoot,
    "--reports-dir",
    reportRoot,
    "--reporter",
    "text",
    "--reporter",
    "json-summary",
    "--reporter",
    "lcov",
    "--all",
    "--include",
    "dist/extension.js",
    "--include",
    "src/extension/asciidoctor-preview-worker.cjs"
  ]);
  const summaryPath = resolve(reportRoot, "coverage-summary.json");
  checkCoverageInventory(summaryPath, "extension");
  checkCoverageSummary(summaryPath, "extension");
} finally {
  rmSync(rawCoverageRoot, { recursive: true, force: true });
  restoreProductionBuild();
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: process.cwd(), stdio: "inherit", env });
  if (result.status !== 0) {
    throw new Error(`${command} failed with exit code ${result.status ?? 1}`);
  }
}

function restoreProductionBuild() {
  const sourceMapPath = resolve("dist/extension.js.map");
  try {
    run("pnpm", ["run", "build"]);
  } finally {
    rmSync(sourceMapPath, { force: true });
  }
}
