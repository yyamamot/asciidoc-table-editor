#!/usr/bin/env node
import { spawnSync } from "node:child_process";

run("node", ["scripts/run-core-app-coverage.mjs"]);
run("node", ["scripts/run-extension-coverage.mjs"]);

function run(command, args) {
  const result = spawnSync(command, args, { cwd: process.cwd(), stdio: "inherit", env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
