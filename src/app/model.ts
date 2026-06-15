import type { GridModel, TableAttributes } from "../core";
import type { WebviewAppModel, WebviewPreviewModel, WebviewTableAppearanceModel } from "./types";

export function createWebviewAppModel(
  grid: GridModel,
  options: { preview?: WebviewPreviewModel; diagnostics?: GridModel["diagnostics"]; formatReview?: WebviewAppModel["formatReview"]; tableAttributes?: TableAttributes } = {}
): WebviewAppModel {
  return {
    mode: grid.diagnostics.some((diagnostic) => diagnostic.severity === "error") ? "fallback" : "table-grid",
    tableId: grid.tableId,
    rowCount: grid.rowCount,
    columnCount: grid.columnCount,
    columns: grid.columns,
    cells: grid.cells,
    tableAppearance: tableAppearanceFromAttributes(options.tableAttributes),
    preview: options.preview ?? { tableHtml: "", blockCellHtmlBySourceCellId: {} },
    formatReview: options.formatReview,
    diagnostics: [...grid.diagnostics, ...(options.diagnostics ?? [])]
  };
}

function tableAppearanceFromAttributes(attributes: TableAttributes | undefined): WebviewTableAppearanceModel {
  return {
    title: attributes?.title?.text,
    id: attributes?.named.id,
    role: attributes?.named.role,
    width: attributes?.named.width,
    frame: attributes?.named.frame,
    grid: attributes?.named.grid,
    stripes: attributes?.named.stripes,
    autowidth: attributes?.options.includes("autowidth") ?? false
  };
}
