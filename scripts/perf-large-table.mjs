#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const timestamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const outRoot = join(root, ".tmp", "perf", "large-table", timestamp);
const cases = [
  { id: "100-cells", rows: 10, columns: 10 },
  { id: "500-cells", rows: 25, columns: 20 },
  { id: "1000-cells", rows: 40, columns: 25 }
];
const limits = {
  parseMs: 200,
  gridMs: 200,
  totalMs: 500
};

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
    limits,
    results,
    passed: failed.length === 0
  };

  writeFileSync(join(outRoot, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  writeFileSync(join(outRoot, "summary.md"), renderSummary(summary), "utf8");

  console.log(`perf large-table summary: ${join(outRoot, "summary.json")}`);
  console.log(`perf large-table result: ${summary.passed ? "pass" : "fail"}`);
  if (!summary.passed) {
    process.exitCode = 1;
  }
}

function runCase(core, testCase) {
  const source = generateTable(testCase.rows, testCase.columns);
  const parseStart = performance.now();
  const parsed = core.parseAsciiDocTable(source);
  const parseMs = performance.now() - parseStart;
  const gridStart = performance.now();
  const grid = core.projectGridModel(parsed);
  const gridMs = performance.now() - gridStart;
  const totalMs = parseMs + gridMs;
  const expectedCells = testCase.rows * testCase.columns;
  const actualCells = parsed.rows.reduce((sum, row) => sum + row.cells.length, 0);
  const diagnostics = [...parsed.errors, ...grid.diagnostics];
  const failures = [];

  if (actualCells !== expectedCells) {
    failures.push(`cell-count ${actualCells} != ${expectedCells}`);
  }
  if (grid.rowCount !== testCase.rows || grid.columnCount !== testCase.columns) {
    failures.push(`grid-size ${grid.rowCount}x${grid.columnCount} != ${testCase.rows}x${testCase.columns}`);
  }
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    failures.push("unexpected error diagnostics");
  }
  if (parseMs > limits.parseMs) {
    failures.push(`parse ${parseMs.toFixed(2)}ms > ${limits.parseMs}ms`);
  }
  if (gridMs > limits.gridMs) {
    failures.push(`grid ${gridMs.toFixed(2)}ms > ${limits.gridMs}ms`);
  }
  if (totalMs > limits.totalMs) {
    failures.push(`total ${totalMs.toFixed(2)}ms > ${limits.totalMs}ms`);
  }

  return {
    ...testCase,
    expectedCells,
    actualCells,
    gridRows: grid.rowCount,
    gridColumns: grid.columnCount,
    parseMs: Number(parseMs.toFixed(3)),
    gridMs: Number(gridMs.toFixed(3)),
    totalMs: Number(totalMs.toFixed(3)),
    diagnosticCount: diagnostics.length,
    failures,
    passed: failures.length === 0
  };
}

function generateTable(rows, columns) {
  const lines = ["|==="];
  for (let row = 1; row <= rows; row += 1) {
    lines.push(Array.from({ length: columns }, (_, column) => `| R${row}C${column + 1}`).join(" "));
  }
  lines.push("|===", "");
  return lines.join("\n");
}

function renderSummary(summary) {
  return [
    "# Large Table Performance",
    "",
    `- result: ${summary.passed ? "pass" : "fail"}`,
    `- generatedAt: ${summary.generatedAt}`,
    "",
    "| Case | Cells | Parse ms | Grid ms | Total ms | Result |",
    "| --- | ---: | ---: | ---: | ---: | --- |",
    ...summary.results.map(
      (result) =>
        `| ${result.id} | ${result.actualCells} | ${result.parseMs} | ${result.gridMs} | ${result.totalMs} | ${
          result.passed ? "pass" : result.failures.join("; ")
        } |`
    ),
    ""
  ].join("\n");
}
