#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "", 10);
if (!Number.isInteger(nodeMajor) || nodeMajor < 24) {
  console.error(`Node.js >=24.0.0 is required; actual=${process.version}`);
  process.exit(1);
}

const expectedPnpm = String(packageJson.packageManager ?? "").replace(/^pnpm@/u, "");
const pnpm = spawnSync("pnpm", ["--version"], { encoding: "utf8" });
const actualPnpm = pnpm.stdout.trim();
if (pnpm.status !== 0 || actualPnpm !== expectedPnpm) {
  console.error(`pnpm ${expectedPnpm} is required; actual=${actualPnpm || "unavailable"}`);
  process.exit(1);
}

console.log(`toolchain ready: node=${process.version} pnpm=${actualPnpm}`);
