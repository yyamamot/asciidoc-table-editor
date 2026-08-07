#!/usr/bin/env node
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { checkCoverageInventory, checkCoverageSummary } from "./coverage-report.mjs";

const reportRoot = resolve("coverage/core-app");
rmSync(reportRoot, { recursive: true, force: true });

run("pnpm", ["exec", "vitest", "run", "--config", "vitest.coverage.config.mts"]);
const summaryPath = resolve(reportRoot, "coverage-summary.json");
checkCoverageInventory(summaryPath, "core");
checkCoverageSummary(summaryPath, "core");
checkCoverageInventory(summaryPath, "app");
checkCoverageSummary(summaryPath, "app");

function run(command, args) {
  const result = spawnSync(command, args, { cwd: process.cwd(), stdio: "inherit", env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
