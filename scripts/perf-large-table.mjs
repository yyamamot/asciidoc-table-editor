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
  { id: "1000-cells", rows: 40, columns: 25 },
  { id: "4000-cells", rows: 160, columns: 25 }
];
const limits = {
  parseMs: 200,
  gridMs: 200,
  totalMs: 500
};
const benchmark = {
  warmupRuns: 2,
  sampleRuns: 5,
  scalingExponentLimit: 1.5
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
  const scaling = evaluateScaling(
    results.find((result) => result.id === "1000-cells"),
    results.find((result) => result.id === "4000-cells")
  );
  const failed = results.filter((result) => !result.passed);
  const summary = {
    generatedAt: new Date().toISOString(),
    limits,
    benchmark,
    results,
    scaling,
    passed: failed.length === 0 && scaling.passed
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
  for (let index = 0; index < benchmark.warmupRuns; index += 1) {
    measureCase(core, source, testCase);
  }

  const measurements = Array.from({ length: benchmark.sampleRuns }, () => measureCase(core, source, testCase));
  const samples = measurements.map(({ parseMs, gridMs, totalMs }) => ({ parseMs, gridMs, totalMs }));
  const parseMs = median(samples.map((sample) => sample.parseMs));
  const gridMs = median(samples.map((sample) => sample.gridMs));
  const totalMs = median(samples.map((sample) => sample.totalMs));
  const validation = measurements[measurements.length - 1];
  const expectedCells = testCase.rows * testCase.columns;
  const failures = [...new Set(measurements.flatMap((measurement) => measurement.failures))];
  if (parseMs > limits.parseMs) {
    failures.push(`parse median ${parseMs.toFixed(2)}ms > ${limits.parseMs}ms`);
  }
  if (gridMs > limits.gridMs) {
    failures.push(`grid median ${gridMs.toFixed(2)}ms > ${limits.gridMs}ms`);
  }
  if (totalMs > limits.totalMs) {
    failures.push(`total median ${totalMs.toFixed(2)}ms > ${limits.totalMs}ms`);
  }

  return {
    ...testCase,
    expectedCells,
    actualCells: validation.actualCells,
    gridRows: validation.gridRows,
    gridColumns: validation.gridColumns,
    parseMs,
    gridMs,
    totalMs,
    samples,
    diagnosticCount: validation.diagnosticCount,
    failures,
    passed: failures.length === 0
  };
}

function measureCase(core, source, testCase) {
  const parseStart = performance.now();
  const parsed = core.parseAsciiDocTable(source);
  const parseMs = roundMilliseconds(performance.now() - parseStart);
  const gridStart = performance.now();
  const grid = core.projectGridModel(parsed);
  const gridMs = roundMilliseconds(performance.now() - gridStart);
  const totalMs = roundMilliseconds(parseMs + gridMs);
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

  return {
    actualCells,
    gridRows: grid.rowCount,
    gridColumns: grid.columnCount,
    parseMs,
    gridMs,
    totalMs,
    diagnosticCount: diagnostics.length,
    failures
  };
}

function evaluateScaling(baseline, target) {
  const cellRatio = target.expectedCells / baseline.expectedCells;
  const timeRatio = target.parseMs / baseline.parseMs;
  const exponent = Number((Math.log(timeRatio) / Math.log(cellRatio)).toFixed(3));
  const failures = [];

  if (!Number.isFinite(exponent)) {
    failures.push("parse scaling exponent is not finite");
  } else if (exponent > benchmark.scalingExponentLimit) {
    failures.push(`parse scaling exponent ${exponent} > ${benchmark.scalingExponentLimit}`);
  }

  return {
    baselineCaseId: baseline.id,
    targetCaseId: target.id,
    cellRatio,
    timeRatio: Number(timeRatio.toFixed(3)),
    exponent,
    limit: benchmark.scalingExponentLimit,
    failures,
    passed: failures.length === 0
  };
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function roundMilliseconds(value) {
  return Number(value.toFixed(3));
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
    `- warm-up runs: ${summary.benchmark.warmupRuns}`,
    `- measured samples: ${summary.benchmark.sampleRuns}`,
    `- parse scaling exponent: ${summary.scaling.exponent} (limit: ${summary.scaling.limit})`,
    ...(summary.scaling.failures.length > 0
      ? summary.scaling.failures.map((failure) => `- scaling failure: ${failure}`)
      : []),
    "",
    "| Case | Cells | Parse median ms | Grid median ms | Total median ms | Result |",
    "| --- | ---: | ---: | ---: | ---: | --- |",
    ...summary.results.map(
      (result) =>
        `| ${result.id} | ${result.actualCells} | ${result.parseMs} | ${result.gridMs} | ${result.totalMs} | ${
          result.passed ? "pass" : result.failures.join("; ")
        } |`
    ),
    "",
    "## Samples",
    "",
    "| Case | Sample | Parse ms | Grid ms | Total ms |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...summary.results.flatMap((result) =>
      result.samples.map(
        (sample, index) =>
          `| ${result.id} | ${index + 1} | ${sample.parseMs} | ${sample.gridMs} | ${sample.totalMs} |`
      )
    ),
    ""
  ].join("\n");
}
