#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

const root = process.cwd();
const timestamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const outRoot = join(root, ".tmp", "perf", "codelens", timestamp);
const iterations = 80;
const limits = {
  p50Ms: 25,
  maxMs: 100
};

const cases = [
  {
    id: "small-2-tables",
    ...generateDocument({ tableCount: 2, proseLines: 200, rows: 4, columns: 4 })
  },
  {
    id: "large-prose-10-tables",
    ...generateDocument({ tableCount: 10, proseLines: 4000, rows: 4, columns: 4 })
  },
  {
    id: "many-tables-100",
    ...generateDocument({ tableCount: 100, proseLines: 500, rows: 4, columns: 4 })
  },
  {
    id: "huge-table-1000x20",
    ...generateDocument({ tableCount: 1, proseLines: 20, rows: 1000, columns: 20 })
  }
];

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});

async function main() {
  const build = spawnSync("pnpm", ["run", "build:test"], {
    cwd: root,
    stdio: "inherit"
  });
  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }

  mkdirSync(outRoot, { recursive: true });
  const core = await import(pathToFileURL(join(root, "out", "src", "core", "index.js")).href);
  const results = cases.map((testCase) => runCase(core, testCase));
  const failed = results.filter((result) => !result.passed);
  const summary = {
    generatedAt: new Date().toISOString(),
    iterations,
    limits,
    results,
    passed: failed.length === 0
  };

  writeFileSync(join(outRoot, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  writeFileSync(join(outRoot, "summary.md"), renderSummary(summary), "utf8");

  console.log(`perf codelens summary: ${join(outRoot, "summary.json")}`);
  console.log(`perf codelens result: ${summary.passed ? "pass" : "fail"}`);
  if (!summary.passed) {
    process.exitCode = 1;
  }
}

function runCase(core, testCase) {
  const samples = [];
  let tableCount = 0;
  for (let index = 0; index < iterations; index += 1) {
    const start = performance.now();
    tableCount = core.findAsciiDocTableBlocks(testCase.source).length;
    samples.push(performance.now() - start);
  }
  samples.sort((left, right) => left - right);

  const minMs = samples[0] ?? 0;
  const p50Ms = percentile(samples, 0.5);
  const p95Ms = percentile(samples, 0.95);
  const maxMs = samples.at(-1) ?? 0;
  const failures = [];

  if (tableCount !== testCase.expectedTables) {
    failures.push(`table-count ${tableCount} != ${testCase.expectedTables}`);
  }
  if (p50Ms > limits.p50Ms) {
    failures.push(`p50 ${p50Ms.toFixed(2)}ms > ${limits.p50Ms}ms`);
  }
  if (maxMs > limits.maxMs) {
    failures.push(`max ${maxMs.toFixed(2)}ms > ${limits.maxMs}ms`);
  }

  return {
    id: testCase.id,
    bytes: Buffer.byteLength(testCase.source),
    lines: testCase.source.split(/\r\n|\n|\r/u).length,
    expectedTables: testCase.expectedTables,
    actualTables: tableCount,
    minMs: Number(minMs.toFixed(3)),
    p50Ms: Number(p50Ms.toFixed(3)),
    p95Ms: Number(p95Ms.toFixed(3)),
    maxMs: Number(maxMs.toFixed(3)),
    failures,
    passed: failures.length === 0
  };
}

function generateDocument({ tableCount, proseLines, rows, columns }) {
  const lines = ["= CodeLens Performance Fixture", ""];
  for (let line = 0; line < proseLines; line += 1) {
    lines.push(`prose line ${line + 1}`);
    const currentTableCount = lines.filter((item) => item === "|===").length / 2;
    if ((line + 1) % Math.max(1, Math.floor(proseLines / tableCount)) === 0 && currentTableCount < tableCount) {
      lines.push("", ...generateTable(rows, columns), "");
    }
  }
  while (lines.filter((item) => item === "|===").length / 2 < tableCount) {
    lines.push("", ...generateTable(rows, columns), "");
  }
  return {
    source: lines.join("\n"),
    expectedTables: tableCount
  };
}

function generateTable(rows, columns) {
  const lines = ["|==="];
  for (let row = 1; row <= rows; row += 1) {
    lines.push(Array.from({ length: columns }, (_, column) => `| R${row}C${column + 1}`).join(" "));
  }
  lines.push("|===");
  return lines;
}

function percentile(values, ratio) {
  if (values.length === 0) {
    return 0;
  }
  const index = Math.min(values.length - 1, Math.floor(values.length * ratio));
  return values[index] ?? 0;
}

function renderSummary(summary) {
  return [
    "# CodeLens Table Detection Performance",
    "",
    `- result: ${summary.passed ? "pass" : "fail"}`,
    `- generatedAt: ${summary.generatedAt}`,
    `- iterations: ${summary.iterations}`,
    "",
    "| Case | Bytes | Lines | Tables | p50 ms | p95 ms | Max ms | Result |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ...summary.results.map(
      (result) =>
        `| ${result.id} | ${result.bytes} | ${result.lines} | ${result.actualTables} | ${result.p50Ms} | ${
          result.p95Ms
        } | ${result.maxMs} | ${result.passed ? "pass" : result.failures.join("; ")} |`
    ),
    ""
  ].join("\n");
}
