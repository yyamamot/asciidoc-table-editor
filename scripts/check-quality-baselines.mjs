#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const baseRef = process.env.QUALITY_BASE_REF || parseBaseRef(process.argv.slice(2)) || "HEAD^";
const checks = [
  ["prettier-baseline.json", comparePrettierBaseline],
  ["eslint-suppressions.json", compareEslintSuppressions],
  ["coverage.config.mjs", compareCoverageThresholds]
];

if (!hasCommit(baseRef)) {
  if (process.env.QUALITY_BASE_REF) {
    throw new Error(`Quality baseline ref does not resolve to a commit: ${baseRef}`);
  }
  console.log(`quality baseline check: ${baseRef} is unavailable; treating this as the initial baseline`);
  process.exit(0);
}

const failures = [];
for (const [filePath, compare] of checks) {
  const baseSource = readFromGit(baseRef, filePath);
  if (baseSource === undefined) {
    console.log(`quality baseline check: ${filePath} has no baseline at ${baseRef}; accepting its initial version`);
    continue;
  }
  compare(baseSource, readFileSync(filePath, "utf8"), failures);
}

if (failures.length > 0) {
  console.error(["quality baseline monotonicity check failed:", ...failures.map((failure) => `- ${failure}`)].join("\n"));
  process.exit(1);
}

console.log(`quality baseline monotonicity check passed against ${baseRef}`);

function comparePrettierBaseline(baseSource, currentSource, output) {
  const base = parseJson(baseSource, "base prettier baseline");
  const current = parseJson(currentSource, "current prettier baseline");
  for (const [filePath, hash] of Object.entries(current.files ?? {})) {
    if (base.files?.[filePath] === undefined) {
      output.push(`prettier baseline adds grandfathered file: ${filePath}`);
    } else if (base.files[filePath] !== hash) {
      output.push(`prettier baseline changes the grandfathered source hash: ${filePath}`);
    }
  }
}

function compareEslintSuppressions(baseSource, currentSource, output) {
  const base = parseJson(baseSource, "base ESLint suppressions");
  const current = parseJson(currentSource, "current ESLint suppressions");
  for (const [filePath, rules] of Object.entries(current)) {
    for (const [ruleName, entry] of Object.entries(rules)) {
      const baseCount = Number(base[filePath]?.[ruleName]?.count ?? 0);
      const currentCount = Number(entry?.count ?? 0);
      if (!Number.isFinite(currentCount) || currentCount > baseCount) {
        output.push(`ESLint suppression count increases: ${filePath} ${ruleName} ${baseCount} -> ${String(entry?.count)}`);
      }
    }
  }
}

function compareCoverageThresholds(baseSource, currentSource, output) {
  const base = parseCoverageThresholds(baseSource);
  const current = parseCoverageThresholds(currentSource);
  for (const [domain, metrics] of Object.entries(base)) {
    for (const metric of Object.keys(metrics)) {
      if (current[domain]?.[metric] === undefined) {
        output.push(`coverage threshold is removed: ${domain}.${metric}`);
      }
    }
  }
  for (const [domain, metrics] of Object.entries(current)) {
    for (const [metric, value] of Object.entries(metrics)) {
      const baseValue = base[domain]?.[metric];
      if (baseValue === undefined) {
        output.push(`coverage threshold adds an unreviewed domain or metric: ${domain}.${metric}`);
      } else if (value < baseValue) {
        output.push(`coverage threshold decreases: ${domain}.${metric} ${baseValue} -> ${value}`);
      }
    }
  }
}

function parseCoverageThresholds(source) {
  const domains = {};
  const pattern = /(\w+): Object\.freeze\(\{ lines: (\d+(?:\.\d+)?), statements: (\d+(?:\.\d+)?), functions: (\d+(?:\.\d+)?), branches: (\d+(?:\.\d+)?) \}\)/gu;
  for (const match of source.matchAll(pattern)) {
    domains[match[1]] = {
      lines: Number(match[2]),
      statements: Number(match[3]),
      functions: Number(match[4]),
      branches: Number(match[5])
    };
  }
  if (Object.keys(domains).length === 0) {
    throw new Error("Could not parse coverage thresholds");
  }
  return domains;
}

function parseJson(source, label) {
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`${label} is not valid JSON`, { cause: error });
  }
}

function hasCommit(ref) {
  return spawnSync("git", ["rev-parse", "--verify", `${ref}^{commit}`], { stdio: "ignore" }).status === 0;
}

function readFromGit(ref, filePath) {
  const result = spawnSync("git", ["show", `${ref}:${filePath}`], { encoding: "utf8" });
  return result.status === 0 ? result.stdout : undefined;
}

function parseBaseRef(args) {
  if (args.length === 0) return undefined;
  if (args.length === 2 && args[0] === "--base" && args[1]) return args[1];
  throw new Error("Usage: node scripts/check-quality-baselines.mjs [--base <git-ref>]");
}
