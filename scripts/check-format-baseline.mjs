#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import * as prettier from "prettier";

const workspaceRoot = resolve(new URL("..", import.meta.url).pathname);
const baselinePath = join(workspaceRoot, "prettier-baseline.json");
const ignorePath = join(workspaceRoot, ".prettierignore");
const mode = parseMode(process.argv.slice(2));

const candidates = await sourceFiles();
const baseline = mode === "baseline" ? emptyBaseline() : readBaseline();
const nextBaseline = emptyBaseline();
const failures = [];
let formattedCount = 0;
let grandfatheredCount = 0;

for (const filePath of candidates) {
  const relativePath = portablePath(relative(workspaceRoot, filePath));
  const source = readFileSync(filePath, "utf8");
  const options = (await prettier.resolveConfig(filePath)) ?? {};
  const formatted = await prettier.format(source, { ...options, filepath: filePath });
  if (formatted === source) {
    if (baseline.files[relativePath] !== undefined && mode === "check") {
      failures.push(`${relativePath}: remove the stale baseline entry; the file is now Prettier-compliant`);
    }
    continue;
  }

  if (mode === "baseline") {
    nextBaseline.files[relativePath] = sha256(source);
    continue;
  }

  if (mode === "write") {
    if (baseline.files[relativePath] === sha256(source)) {
      grandfatheredCount += 1;
      continue;
    }
    writeFileSync(filePath, formatted, "utf8");
    formattedCount += 1;
    continue;
  }

  if (baseline.files[relativePath] === sha256(source)) {
    grandfatheredCount += 1;
  } else {
    failures.push(`${relativePath}: format with \`pnpm run format\`; new or modified files cannot add unformatted output`);
  }
}

if (mode === "baseline") {
  writeJson(baselinePath, nextBaseline);
  console.log(`format baseline updated: ${Object.keys(nextBaseline.files).length} grandfathered files`);
  process.exit(0);
}

const candidateSet = new Set(candidates.map((filePath) => portablePath(relative(workspaceRoot, filePath))));
for (const relativePath of Object.keys(baseline.files)) {
  if (!candidateSet.has(relativePath)) {
    failures.push(`${relativePath}: remove the stale baseline entry; the file no longer exists or is ignored`);
  }
}

if (failures.length > 0) {
  console.error(["format baseline check failed:", ...failures.map((failure) => `- ${failure}`)].join("\n"));
  process.exit(1);
}

console.log(
  mode === "write"
    ? `format write complete: ${formattedCount} formatted, ${grandfatheredCount} grandfathered`
    : `format check passed: ${candidates.length} files, ${grandfatheredCount} grandfathered`
);

function parseMode(args) {
  if (args.length === 0 || (args.length === 1 && args[0] === "--check")) return "check";
  if (args.length === 1 && args[0] === "--write") return "write";
  if (args.length === 1 && args[0] === "--update-baseline") return "baseline";
  console.error("Usage: node scripts/check-format-baseline.mjs [--check|--write|--update-baseline]");
  process.exit(2);
}

async function sourceFiles() {
  const rootFiles = [
    join(workspaceRoot, ".prettierrc.json"),
    ...readdirSync(workspaceRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.(?:cjs|json|mjs|mts|ts|yaml|yml)$/u.test(entry.name))
      .map((entry) => join(workspaceRoot, entry.name))
  ];
  const files = [...rootFiles, ...[".github/workflows", "src", "test", "scripts"].flatMap((directory) => walk(join(workspaceRoot, directory)))];
  const included = [];
  for (const filePath of files.sort()) {
    const info = await prettier.getFileInfo(filePath, { ignorePath });
    if (!info.ignored && info.inferredParser !== null) included.push(filePath);
  }
  return included;
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = join(directory, entry.name);
    if (entry.isDirectory()) return walk(filePath);
    return /\.(?:cjs|json|mjs|mts|ts|yaml|yml)$/u.test(entry.name) ? [filePath] : [];
  });
}

function readBaseline() {
  if (!existsSync(baselinePath)) {
    throw new Error(`Format baseline is missing: ${baselinePath}`);
  }
  const parsed = JSON.parse(readFileSync(baselinePath, "utf8"));
  if (parsed?.version !== 1 || typeof parsed.files !== "object" || parsed.files === null || Array.isArray(parsed.files)) {
    throw new Error(`Format baseline has an unsupported shape: ${baselinePath}`);
  }
  if (parsed.prettierVersion !== prettier.version) {
    throw new Error(`Format baseline was created with Prettier ${String(parsed.prettierVersion)}; installed version is ${prettier.version}`);
  }
  for (const [filePath, hash] of Object.entries(parsed.files)) {
    if (
      !/^(?:(?:\.github\/workflows|scripts|src|test)\/[A-Za-z0-9._/-]+|[A-Za-z0-9._-]+)$/u.test(filePath) ||
      typeof hash !== "string" ||
      !/^[a-f0-9]{64}$/u.test(hash)
    ) {
      throw new Error(`Format baseline contains an invalid entry: ${filePath}`);
    }
  }
  return parsed;
}

function emptyBaseline() {
  return { version: 1, prettierVersion: prettier.version, files: {} };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function portablePath(value) {
  return value.replaceAll("\\", "/");
}

function writeJson(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  const sortedFiles = Object.fromEntries(Object.entries(value.files).sort(([left], [right]) => left.localeCompare(right)));
  writeFileSync(filePath, `${JSON.stringify({ ...value, files: sortedFiles }, null, 2)}\n`, "utf8");
}
