#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const timestamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const outRoot = join(root, ".tmp", "perf", "preview-block-cells", timestamp);
const thresholds = { coldMs: 10_000, warmMs: 500 };
const workerOptions = {
  workerPath: join(root, "src", "extension", "asciidoctor-preview-worker.cjs"),
  vendorNodeModulesPath: join(root, "node_modules")
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});

async function main() {
  const build = spawnSync("pnpm", ["run", "build:test"], { cwd: root, stdio: "inherit" });
  if (build.status !== 0) process.exit(build.status ?? 1);

  const fixture = JSON.parse(
    readFileSync(join(root, "fixtures", "performance", "preview-block-cells.json"), "utf8")
  );
  const preview = await import(pathToFileURL(join(root, "out", "src", "extension", "table-editor-preview.js")).href);
  const worker = await import(pathToFileURL(join(root, "out", "src", "extension", "asciidoctor-worker-renderer.js")).href);
  const results = [];

  for (const testCase of fixture.cases) {
    preview.resetTableEditorPreviewCacheForTest();
    worker.resetPreviewWorkerLifecycleForTest();
    const source = blockCellTable(testCase.blockCellCount);
    const cold = await measure(() => preview.renderTableEditorPreview(source, { worker: workerOptions }));
    const afterCold = worker.previewWorkerLifecycleForTest();
    const warm = await measure(() => preview.renderTableEditorPreview(source, { worker: workerOptions }));
    const afterWarm = worker.previewWorkerLifecycleForTest();
    const cache = preview.tableEditorPreviewCacheStatsForTest();
    const failures = [];
    const coldCount = Object.keys(cold.value.preview.blockCellHtmlBySourceCellId).length;
    const warmCount = Object.keys(warm.value.preview.blockCellHtmlBySourceCellId).length;
    if (cold.value.diagnostics.length > 0 || warm.value.diagnostics.length > 0) failures.push("unexpected diagnostics");
    if (coldCount !== testCase.blockCellCount || warmCount !== testCase.blockCellCount) failures.push("block-cell count mismatch");
    if (afterCold.started !== 1 || afterCold.active !== 0) failures.push("cold render did not use and clean up exactly one worker");
    if (afterWarm.started !== 1 || afterWarm.active !== 0) failures.push("warm render started a worker or leaked cleanup");
    if (cold.elapsedMs > thresholds.coldMs) failures.push(`cold ${cold.elapsedMs}ms > ${thresholds.coldMs}ms`);
    if (warm.elapsedMs > thresholds.warmMs) failures.push(`warm ${warm.elapsedMs}ms > ${thresholds.warmMs}ms`);

    results.push({
      ...testCase,
      coldMs: cold.elapsedMs,
      warmMs: warm.elapsedMs,
      cache,
      workerAfterCold: afterCold,
      workerAfterWarm: afterWarm,
      failures,
      passed: failures.length === 0
    });
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    thresholds,
    results,
    passed: results.every((result) => result.passed)
  };
  mkdirSync(outRoot, { recursive: true });
  writeFileSync(join(outRoot, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(`perf preview-block-cells summary: ${join(outRoot, "summary.json")}`);
  console.log(`perf preview-block-cells result: ${summary.passed ? "pass" : "fail"}`);
  if (!summary.passed) process.exitCode = 1;
}

async function measure(run) {
  const startedAt = performance.now();
  const value = await run();
  return { value, elapsedMs: Number((performance.now() - startedAt).toFixed(3)) };
}

function blockCellTable(count) {
  return [
    "[cols=\"1\"]",
    "|===",
    ...Array.from({ length: count }, (_, index) => `a| block cell ${index}`),
    "|===",
    ""
  ].join("\n");
}
