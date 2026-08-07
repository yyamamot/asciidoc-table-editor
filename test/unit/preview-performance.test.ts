import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  previewWorkerLifecycleForTest,
  resetPreviewWorkerLifecycleForTest,
  resolvePreviewVendorNodeModulesPathForSmoke
} from "../../src/extension/asciidoctor-worker-renderer";
import {
  renderTableEditorPreview,
  resetTableEditorPreviewCacheForTest,
  tableEditorPreviewCacheStatsForTest
} from "../../src/extension/table-editor-preview";

interface PerformanceFixture {
  readonly cases: ReadonlyArray<{ readonly id: string; readonly blockCellCount: number }>;
}

const vendorNodeModulesPath = resolvePreviewVendorNodeModulesPathForSmoke();
const batchWorkerPath = join(process.cwd(), "test", "support", "preview-batch-worker.cjs");
const alternateBatchWorkerPath = join(process.cwd(), "test", "support", "preview-alternate-batch-worker.cjs");
const emptyWorkerPath = join(process.cwd(), "test", "support", "preview-empty-worker.cjs");
const largeBatchWorkerPath = join(process.cwd(), "test", "support", "preview-large-batch-worker.cjs");
const sparseBatchWorkerPath = join(process.cwd(), "test", "support", "preview-sparse-batch-worker.cjs");
const timeoutWorkerPath = join(process.cwd(), "test", "support", "preview-timeout-worker.cjs");
const fixture = JSON.parse(
  readFileSync(join(process.cwd(), "fixtures", "performance", "preview-block-cells.json"), "utf8")
) as PerformanceFixture;

describe("preview worker batching and cache", () => {
  beforeEach(() => {
    resetTableEditorPreviewCacheForTest();
    resetPreviewWorkerLifecycleForTest();
  });

  for (const performanceCase of fixture.cases) {
    it(`renders ${performanceCase.id} cold and warm with one cold worker`, async () => {
      const source = blockCellTable(performanceCase.blockCellCount);
      const cold = await renderTableEditorPreview(source);
      const afterCold = previewWorkerLifecycleForTest();
      const warm = await renderTableEditorPreview(source);
      const afterWarm = previewWorkerLifecycleForTest();

      expect(cold.diagnostics).toEqual([]);
      expect(Object.keys(cold.preview.blockCellHtmlBySourceCellId)).toHaveLength(performanceCase.blockCellCount);
      expect(warm.preview).toEqual(cold.preview);
      expect(afterCold).toEqual({ active: 0, started: 1 });
      expect(afterWarm).toEqual(afterCold);
      expect(tableEditorPreviewCacheStatsForTest().entries).toBe(performanceCase.blockCellCount + 1);
    }, 20_000);
  }

  it("deduplicates identical fragments inside one batch and reuses sanitized cache entries", async () => {
    const source = repeatedBlockCellTable(50, "same block");
    const cold = await renderTableEditorPreview(source, {
      worker: { workerPath: batchWorkerPath, vendorNodeModulesPath }
    });
    const afterCold = previewWorkerLifecycleForTest();
    const warm = await renderTableEditorPreview(source, {
      worker: { workerPath: batchWorkerPath, vendorNodeModulesPath }
    });

    expect(cold.diagnostics).toEqual([]);
    expect(warm.preview).toEqual(cold.preview);
    expect(afterCold).toEqual({ active: 0, started: 1 });
    expect(previewWorkerLifecycleForTest()).toEqual(afterCold);
    expect(tableEditorPreviewCacheStatsForTest().entries).toBe(2);
  });

  it("keeps successful fragments when one batch item fails", async () => {
    const source = "[cols=\"1\"]\n|===\na| PASS_FRAGMENT\na| FAIL_FRAGMENT\na| PASS_AFTER_FAILURE\n|===\n";
    const result = await renderTableEditorPreview(source, {
      worker: { workerPath: batchWorkerPath, vendorNodeModulesPath }
    });

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "preview.block-render-failed",
        message: "fixture fragment failure",
        nodeId: "cell:1:0"
      })
    ]);
    expect(result.preview.blockCellHtmlBySourceCellId["cell:0:0"]).toContain("PASS_FRAGMENT");
    expect(result.preview.blockCellHtmlBySourceCellId["cell:1:0"]).toContain("<pre><code>");
    expect(result.preview.blockCellHtmlBySourceCellId["cell:2:0"]).toContain("PASS_AFTER_FAILURE");
    expect(previewWorkerLifecycleForTest().active).toBe(0);
  });

  it("times out the whole batch and awaits worker cleanup", async () => {
    const result = await renderTableEditorPreview(blockCellTable(3), {
      worker: { workerPath: timeoutWorkerPath, vendorNodeModulesPath, timeoutMs: 5 }
    });

    expect(result.diagnostics).toHaveLength(4);
    expect(result.diagnostics.every((diagnostic) => diagnostic.message.includes("timed out"))).toBe(true);
    expect(previewWorkerLifecycleForTest()).toEqual({ active: 0, started: 1 });
    expect(tableEditorPreviewCacheStatsForTest()).toEqual({ entries: 0, bytes: 0 });
  });

  it("rejects a sparse batch response without leaving an undiagnosed fragment", async () => {
    const result = await renderTableEditorPreview(blockCellTable(1), {
      worker: { workerPath: sparseBatchWorkerPath, vendorNodeModulesPath }
    });

    expect(result.diagnostics).toHaveLength(2);
    expect(result.diagnostics.every((diagnostic) => diagnostic.message.includes("sparse batch"))).toBe(true);
    expect(result.preview.blockCellHtmlBySourceCellId["cell:0:0"]).toContain("<pre><code>");
    expect(previewWorkerLifecycleForTest()).toEqual({ active: 0, started: 1 });
  });

  it("fails immediately when a worker exits without a batch response", async () => {
    const result = await renderTableEditorPreview(blockCellTable(1), {
      worker: { workerPath: emptyWorkerPath, vendorNodeModulesPath, timeoutMs: 1_000 }
    });

    expect(result.diagnostics).toHaveLength(2);
    expect(result.diagnostics.every((diagnostic) => diagnostic.message.includes("exited before returning"))).toBe(true);
    expect(previewWorkerLifecycleForTest()).toEqual({ active: 0, started: 1 });
  });

  it("isolates cache entries for different worker identities", async () => {
    const source = blockCellTable(1);
    const first = await renderTableEditorPreview(source, {
      worker: { workerPath: batchWorkerPath, vendorNodeModulesPath }
    });
    const second = await renderTableEditorPreview(source, {
      worker: { workerPath: alternateBatchWorkerPath, vendorNodeModulesPath }
    });

    expect(first.preview.blockCellHtmlBySourceCellId["cell:0:0"]).toContain("block cell 0");
    expect(second.preview.blockCellHtmlBySourceCellId["cell:0:0"]).toContain("alternate-1");
    expect(previewWorkerLifecycleForTest()).toEqual({ active: 0, started: 2 });
    expect(tableEditorPreviewCacheStatsForTest().entries).toBe(4);
  });

  it("bounds the shared LRU by entry count", async () => {
    const result = await renderTableEditorPreview(blockCellTable(300), {
      worker: { workerPath: batchWorkerPath, vendorNodeModulesPath }
    });

    expect(result.diagnostics).toEqual([]);
    expect(tableEditorPreviewCacheStatsForTest().entries).toBe(256);
    expect(tableEditorPreviewCacheStatsForTest().bytes).toBeLessThanOrEqual(16 * 1024 * 1024);
    expect(previewWorkerLifecycleForTest()).toEqual({ active: 0, started: 1 });
  });

  it("evicts shared LRU entries when source and sanitized HTML exceed the byte budget", async () => {
    const result = await renderTableEditorPreview(blockCellTable(20), {
      worker: { workerPath: largeBatchWorkerPath, vendorNodeModulesPath }
    });
    const cache = tableEditorPreviewCacheStatsForTest();

    expect(result.diagnostics).toEqual([]);
    expect(cache.entries).toBeGreaterThan(0);
    expect(cache.entries).toBeLessThan(21);
    expect(cache.bytes).toBeLessThanOrEqual(16 * 1024 * 1024);
    expect(previewWorkerLifecycleForTest()).toEqual({ active: 0, started: 1 });
  });
});

function blockCellTable(count: number): string {
  return [
    "[cols=\"1\"]",
    "|===",
    ...Array.from({ length: count }, (_, index) => `a| block cell ${index}`),
    "|===",
    ""
  ].join("\n");
}

function repeatedBlockCellTable(count: number, content: string): string {
  return ["[cols=\"1\"]", "|===", ...Array.from({ length: count }, () => `a| ${content}`), "|===", ""].join("\n");
}
