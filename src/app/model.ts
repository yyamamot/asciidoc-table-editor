import type { GridModel } from "../core";
import type { WebviewAppModel, WebviewPreviewModel } from "./types";

export function createWebviewAppModel(
  grid: GridModel,
  options: { preview?: WebviewPreviewModel; diagnostics?: GridModel["diagnostics"]; formatReview?: WebviewAppModel["formatReview"] } = {}
): WebviewAppModel {
  return {
    mode: grid.diagnostics.some((diagnostic) => diagnostic.severity === "error") ? "fallback" : "table-grid",
    tableId: grid.tableId,
    rowCount: grid.rowCount,
    columnCount: grid.columnCount,
    cells: grid.cells,
    preview: options.preview ?? { tableHtml: "", blockCellHtmlBySourceCellId: {} },
    formatReview: options.formatReview,
    diagnostics: [...grid.diagnostics, ...(options.diagnostics ?? [])]
  };
}
