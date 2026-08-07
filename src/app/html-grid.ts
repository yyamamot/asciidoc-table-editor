import type { GridCell } from "../core";
import type { RenderTableEditorOptions, TableEditorWebviewLabels, WebviewAppModel } from "./types";
import { escapeHtml, leadingWhitespace } from "./html-utils";

export function renderGrid(model: WebviewAppModel, options: RenderTableEditorOptions, labels: TableEditorWebviewLabels, nonce: string): string {
  const renderOptions = {
    ...options,
    blockCellPreviewHtmlBySourceCellId: model.preview.blockCellHtmlBySourceCellId
  };
  const originCells = model.cells
    .flat()
    .filter((cell): cell is Extract<GridCell, { kind: "origin" }> => cell !== undefined && cell.kind === "origin");
  const activeSourceCellId = originCells.some((cell) => cell.sourceCellId === options.selectedSourceCellId)
    ? options.selectedSourceCellId
    : originCells[0]?.sourceCellId;
  const layoutCss = originCells
    .map(
      (cell, index) =>
        `.cell-layout-${index}{grid-row:${cell.row + 1} / span ${cell.rowSpan};grid-column:${cell.col + 1} / span ${cell.colSpan};}`
    )
    .join("\n");
  const cellsByRow = new Map<number, string[]>();
  originCells.forEach((cell, index) => {
    const rowCells = cellsByRow.get(cell.row) ?? [];
    rowCells.push(renderCell(cell, model.columns[cell.col], renderOptions, labels, `cell-layout-${index}`, cell.sourceCellId === activeSourceCellId));
    cellsByRow.set(cell.row, rowCells);
  });
  const rows = Array.from({ length: model.rowCount }, (_, row) =>
    `<div class="grid-row" role="row" data-grid-row="${row}" aria-rowindex="${row + 1}">${(cellsByRow.get(row) ?? []).join("")}</div>`
  ).join("");
  return `<style nonce="${escapeHtml(nonce)}">${layoutCss}</style><div class="grid" role="grid" data-review-target="table-grid" aria-label="${escapeHtml(labels.tableGrid)}" aria-rowcount="${model.rowCount}" aria-colcount="${model.columnCount}">${rows}</div><div class="grid-selection-status" data-grid-selection-status aria-live="polite" aria-atomic="true"></div>`;
}

function renderCell(
  cell: Extract<GridCell, { kind: "origin" }>,
  columnSpec: WebviewAppModel["columns"][number] | undefined,
  options: RenderTableEditorOptions,
  labels: TableEditorWebviewLabels,
  layoutClass: string,
  active: boolean
): string {
  const selected = options.selectedSourceCellId === cell.sourceCellId;
  const selectionClass = selected ? " is-selected" : "";
  const ariaSelected = String(selected);
  const spanned = cell.rowSpan > 1 || cell.colSpan > 1;
  const leading = leadingWhitespace(cell.contentRaw);
  const editContent = cell.contentRaw.slice(leading.length);
  const sourceContent = cell.contentRaw.trimStart();
  const displayContent = displayContentForGridCell(sourceContent);
  const state = cell.editable ? labels.editable : labels.readonly;
  const accessibleName = `${labels.row} ${cell.row + 1}, ${labels.column} ${cell.col + 1}, ${labels.span} ${cell.rowSpan} x ${cell.colSpan}, ${state}, ${displayContent}`;
  const blockBadge = cell.blockContent
    ? `<span class="cell-badge cell-badge-block" title="${escapeHtml(labels.blockCell)}" aria-label="${escapeHtml(labels.blockCell)}">&lt;/&gt;</span>`
    : "";

  return `<div class="cell ${layoutClass}${selectionClass}" role="gridcell" tabindex="${active ? "0" : "-1"}" aria-label="${escapeHtml(accessibleName)}" data-kind="origin" data-source-cell-id="${escapeHtml(
    cell.sourceCellId
  )}" title="${escapeHtml(
    cell.contentRaw.trim()
  )}" data-row="${cell.row}" data-col="${cell.col}" data-row-role="${cell.role}" data-style="${escapeHtml(cell.style ?? "")}" data-horizontal-align="${cell.horizontalAlign ?? ""}" data-vertical-align="${cell.verticalAlign ?? ""}" data-column-width="${escapeHtml(columnSpec?.widthRaw ?? "")}" data-column-style="${escapeHtml(columnSpec?.style ?? "")}" data-row-span="${cell.rowSpan}" data-col-span="${cell.colSpan}" data-content="${escapeHtml(
    cell.contentRaw.trim()
  )}" data-leading="${escapeHtml(
    leading
  )}" data-edit-content="${escapeHtml(
    editContent
  )}" data-block-preview-html="${escapeHtml(
    cell.blockContent ? options.blockCellPreviewHtmlBySourceCellId?.[cell.sourceCellId] ?? "" : ""
  )}" data-block="${String(cell.blockContent)}" data-spanned="${String(spanned)}" aria-readonly="${String(!cell.editable)}" aria-selected="${ariaSelected}" aria-rowindex="${cell.row + 1}" aria-colindex="${cell.col + 1}" aria-rowspan="${cell.rowSpan}" aria-colspan="${cell.colSpan}">${blockBadge}${escapeHtml(
    displayContent
  )}</div>`;
}

export function displayContentForGridCell(sourceContent: string): string {
  let output = "";
  let cursor = 0;
  const pattern = /\b(?:https?:\/\/[^\s\[]+|mailto:[^\s\[]+)\[([^\]\n]+)\]/gu;
  for (const match of sourceContent.matchAll(pattern)) {
    const index = match.index ?? 0;
    output += sourceContent.slice(cursor, index);
    output += match[1].replace(/\\\]/gu, "]");
    cursor = index + match[0].length;
  }
  return output + sourceContent.slice(cursor);
}
