#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const TARGET_DIRS = ["src", "test", "docs", "scripts"];
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".md"]);
const TOP_LIMIT = 25;

function extensionOf(path) {
  const index = path.lastIndexOf(".");
  return index === -1 ? "" : path.slice(index);
}

function collectFiles(dir) {
  const result = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === "out" || entry === ".tmp") {
      continue;
    }
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      result.push(...collectFiles(path));
    } else if (stat.isFile() && EXTENSIONS.has(extensionOf(path))) {
      result.push(path);
    }
  }
  return result;
}

function lineCount(path) {
  const text = readFileSync(path, "utf8");
  if (text.length === 0) {
    return 0;
  }
  return text.split(/\r?\n/u).length;
}

function recommendation(path, lines) {
  const normalized = path.replaceAll("\\", "/");
  if (normalized === "src/extension/commands.ts") {
    return "IMP-089 command split";
  }
  if (normalized === "src/core/parser.ts") {
    return "IMP-090 parser phase split";
  }
  if (normalized === "src/app/html-styles.ts") {
    return "IMP-091 CSS surface split";
  }
  if (normalized === "test/integration-host/suite.ts") {
    return "IMP-092 host test split";
  }
  if (lines >= 500) {
    return "review split candidate";
  }
  if (lines >= 300) {
    return "monitor";
  }
  return "ok";
}

const files = TARGET_DIRS.flatMap((dir) => {
  const path = join(ROOT, dir);
  try {
    return collectFiles(path);
  } catch {
    return [];
  }
});

const rows = files
  .map((path) => {
    const rel = relative(ROOT, path);
    const lines = lineCount(path);
    return { path: rel, lines, recommendation: recommendation(rel, lines) };
  })
  .sort((a, b) => b.lines - a.lines)
  .slice(0, TOP_LIMIT);

console.log("LLM token efficiency report (report-only)");
console.log(`Top ${rows.length} files by line count:`);
for (const row of rows) {
  console.log(`${String(row.lines).padStart(5, " ")}  ${row.path}  ${row.recommendation}`);
}

