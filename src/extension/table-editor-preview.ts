import { createHash } from "node:crypto";
import { parseAsciiDocTable, type TableDiagnostic } from "../core";
import { sanitizePreviewHtml, type WebviewPreviewModel } from "../app";
import {
  renderAsciiDocBatchWithVendoredWorker,
  type AsciidoctorWorkerRenderOptions
} from "./asciidoctor-worker-renderer";

export interface TableEditorPreviewResult {
  readonly preview: WebviewPreviewModel;
  readonly diagnostics: TableDiagnostic[];
}

export interface TableEditorPreviewRenderOptions {
  readonly worker?: AsciidoctorWorkerRenderOptions;
}

interface PreviewFragment {
  readonly source: string;
  readonly code: string;
  readonly nodeId?: string;
}

interface PreviewCacheEntry {
  readonly html: string;
  readonly bytes: number;
}

const rendererAndSanitizerVersion = "asciidoctor-core-3.0.4/preview-sanitizer-v1";
const previewCacheEntryLimit = 256;
const previewCacheByteLimit = 16 * 1024 * 1024;
const previewCache = new Map<string, PreviewCacheEntry>();
let previewCacheBytes = 0;

export async function renderTableEditorPreview(
  tableSource: string,
  options: TableEditorPreviewRenderOptions = {}
): Promise<TableEditorPreviewResult> {
  const diagnostics: TableDiagnostic[] = [];
  const table = parseAsciiDocTable(tableSource);
  const fragments: PreviewFragment[] = [{ source: tableSource, code: "preview.table-render-failed" }];

  for (const cell of table.rows.flatMap((row) => row.cells)) {
    if (cell.isBlockContent) {
      fragments.push({
        source: cell.contentRaw.trimStart(),
        code: "preview.block-render-failed",
        nodeId: cell.nodeId
      });
    }
  }

  const renderedFragments = await renderPreviewFragments(fragments, diagnostics, options.worker);
  const blockCellHtmlBySourceCellId: Record<string, string> = {};
  for (let index = 1; index < fragments.length; index += 1) {
    const nodeId = fragments[index]?.nodeId;
    if (nodeId !== undefined) {
      blockCellHtmlBySourceCellId[nodeId] = renderedFragments[index] ?? "";
    }
  }

  return {
    preview: {
      tableHtml: renderedFragments[0] ?? "",
      blockCellHtmlBySourceCellId
    },
    diagnostics
  };
}

export function resetTableEditorPreviewCacheForTest(): void {
  previewCache.clear();
  previewCacheBytes = 0;
}

export function tableEditorPreviewCacheStatsForTest(): { readonly entries: number; readonly bytes: number } {
  return { entries: previewCache.size, bytes: previewCacheBytes };
}

async function renderPreviewFragments(
  fragments: readonly PreviewFragment[],
  diagnostics: TableDiagnostic[],
  workerOptions: AsciidoctorWorkerRenderOptions | undefined
): Promise<string[]> {
  const htmlByFragment = new Array<string>(fragments.length);
  const missIndicesByKey = new Map<string, number[]>();
  const sourceByKey = new Map<string, string>();

  fragments.forEach((fragment, index) => {
    const key = previewCacheKey(fragment.source, workerOptions);
    const cached = readPreviewCache(key);
    if (cached !== undefined) {
      htmlByFragment[index] = cached;
      return;
    }
    const indices = missIndicesByKey.get(key);
    if (indices === undefined) {
      missIndicesByKey.set(key, [index]);
      sourceByKey.set(key, fragment.source);
    } else {
      indices.push(index);
    }
  });

  const missKeys = [...missIndicesByKey.keys()];
  const results = await renderAsciiDocBatchWithVendoredWorker(
    missKeys.map((key) => ({ source: sourceByKey.get(key) ?? "" })),
    workerOptions
  );
  results.forEach((result, missIndex) => {
    const key = missKeys[missIndex];
    if (key === undefined) return;
    const fragmentIndices = missIndicesByKey.get(key) ?? [];
    if (result.ok && result.html !== undefined) {
      const html = sanitizePreviewHtml(result.html);
      writePreviewCache(key, sourceByKey.get(key) ?? "", html);
      for (const fragmentIndex of fragmentIndices) htmlByFragment[fragmentIndex] = html;
      return;
    }
    for (const fragmentIndex of fragmentIndices) {
      const fragment = fragments[fragmentIndex];
      if (fragment === undefined) continue;
      diagnostics.push({
        code: fragment.code,
        severity: "warning",
        message: result.message ?? "Preview worker did not return HTML",
        nodeId: fragment.nodeId
      });
      htmlByFragment[fragmentIndex] = sanitizePreviewHtml(renderFallbackPreview(fragment.source));
    }
  });

  return htmlByFragment;
}

function previewCacheKey(source: string, workerOptions: AsciidoctorWorkerRenderOptions | undefined): string {
  const workerIdentity = workerOptions === undefined
    ? "default-worker"
    : `${workerOptions.workerPath ?? "default-worker"}\0${workerOptions.vendorNodeModulesPath ?? "default-vendor"}`;
  return createHash("sha256")
    .update(rendererAndSanitizerVersion)
    .update("\0")
    .update(workerIdentity)
    .update("\0")
    .update(source)
    .digest("hex");
}

function readPreviewCache(key: string): string | undefined {
  const entry = previewCache.get(key);
  if (entry === undefined) return undefined;
  previewCache.delete(key);
  previewCache.set(key, entry);
  return entry.html;
}

function writePreviewCache(key: string, source: string, html: string): void {
  const bytes = Buffer.byteLength(source, "utf8") + Buffer.byteLength(html, "utf8");
  if (bytes > previewCacheByteLimit) return;
  const existing = previewCache.get(key);
  if (existing !== undefined) {
    previewCache.delete(key);
    previewCacheBytes -= existing.bytes;
  }
  previewCache.set(key, { html, bytes });
  previewCacheBytes += bytes;
  while (previewCache.size > previewCacheEntryLimit || previewCacheBytes > previewCacheByteLimit) {
    const oldestKey = previewCache.keys().next().value as string | undefined;
    if (oldestKey === undefined) break;
    const oldest = previewCache.get(oldestKey);
    previewCache.delete(oldestKey);
    previewCacheBytes -= oldest?.bytes ?? 0;
  }
}

function renderFallbackPreview(source: string): string {
  const escaped = source
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return `<pre><code>${escaped}</code></pre>`;
}
