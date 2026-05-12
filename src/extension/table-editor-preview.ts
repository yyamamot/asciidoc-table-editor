import { parseAsciiDocTable, type TableDiagnostic } from "../core";
import { sanitizePreviewHtml, type WebviewPreviewModel } from "../app";
import { renderAsciiDocWithVendoredWorker } from "./asciidoctor-worker-renderer";

export interface TableEditorPreviewResult {
  readonly preview: WebviewPreviewModel;
  readonly diagnostics: TableDiagnostic[];
}

export async function renderTableEditorPreview(tableSource: string): Promise<TableEditorPreviewResult> {
  const diagnostics: TableDiagnostic[] = [];
  const tableHtml = await renderPreviewFragment(tableSource, "preview.table-render-failed", diagnostics);
  const table = parseAsciiDocTable(tableSource);
  const blockCellHtmlBySourceCellId: Record<string, string> = {};

  for (const cell of table.rows.flatMap((row) => row.cells)) {
    if (!cell.isBlockContent) {
      continue;
    }
    blockCellHtmlBySourceCellId[cell.nodeId] = await renderPreviewFragment(
      cell.contentRaw.trimStart(),
      "preview.block-render-failed",
      diagnostics,
      cell.nodeId
    );
  }

  return {
    preview: {
      tableHtml,
      blockCellHtmlBySourceCellId
    },
    diagnostics
  };
}

async function renderPreviewFragment(
  source: string,
  code: string,
  diagnostics: TableDiagnostic[],
  nodeId?: string
): Promise<string> {
  const result = await renderAsciiDocWithVendoredWorker(source);
  if (result.ok && result.html !== undefined) {
    return sanitizePreviewHtml(result.html);
  }

  diagnostics.push({
    code,
    severity: "warning",
    message: result.message ?? "Preview worker did not return HTML",
    nodeId
  });
  return sanitizePreviewHtml(renderFallbackPreview(source));
}

function renderFallbackPreview(source: string): string {
  const escaped = source
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return `<pre><code>${escaped}</code></pre>`;
}
