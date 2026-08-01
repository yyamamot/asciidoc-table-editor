#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const targets = parseTargets(process.argv.slice(2));

runRequired("pnpm", ["run", "check:toolchain"], "toolchain preflight");
runRequired("pnpm", ["run", "build"], "extension build");
runRequired("pnpm", ["run", "build:test"], "test build");

const runner = join(process.cwd(), "out", "test", "integration-host", "run.js");
if (!existsSync(runner)) {
  console.error(`Host integration runner not found: ${runner}`);
  process.exit(1);
}

for (const target of targets) {
  runRequired(process.execPath, [runner, "--target", target], `VS Code ${target} Host integration`);
}

function parseTargets(args) {
  let target = "current";
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--target") {
      const value = args[index + 1];
      if (!value || !["current", "minimum", "matrix"].includes(value)) {
        failUsage(`--target must be current, minimum, or matrix; received: ${value ?? "missing"}`);
      }
      target = value;
      index += 1;
      continue;
    }
    failUsage(`Unknown argument: ${arg}`);
  }
  return target === "matrix" ? ["minimum", "current"] : [target];
}

function runRequired(command, args, label) {
  console.log(`\n[test:integration:host] ${label}`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit"
  });
  if (result.status !== 0) {
    console.error(`[test:integration:host] ${label} failed with exit code ${result.status ?? 1}.`);
    process.exit(result.status ?? 1);
  }
}

function failUsage(message) {
  console.error(message);
  console.error("Usage: pnpm run test:integration:host -- [--target current|minimum|matrix]");
  process.exit(2);
}
