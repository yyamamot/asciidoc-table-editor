#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

if (process.env.ASCIIDOC_TABLE_RUN_NIGHTLY_VISUAL !== "1") {
  console.log("nightly visual skipped: set ASCIIDOC_TABLE_RUN_NIGHTLY_VISUAL=1 to run.");
  process.exit(0);
}

const build = spawnSync("pnpm", ["run", "build"], {
  cwd: process.cwd(),
  stdio: "inherit"
});

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const buildTest = spawnSync("pnpm", ["run", "build:test"], {
  cwd: process.cwd(),
  stdio: "inherit"
});

if (buildTest.status !== 0) {
  process.exit(buildTest.status ?? 1);
}

const runner = join(process.cwd(), "out", "test", "nightly-visual", "run.js");
if (!existsSync(runner)) {
  console.error(`nightly visual runner not found: ${runner}`);
  process.exit(1);
}

const run = spawnSync(process.execPath, [runner], {
  cwd: process.cwd(),
  stdio: "inherit"
});

process.exit(run.status ?? 1);
