import { codiconEditIcon, codiconFormatIcon, codiconPreviewIcon, codiconRedoIcon, codiconUndoIcon, mergeCellsIcon, unmergeCellsIcon } from "./icons";
import type { TableEditorWebviewLabels, WebviewAppModel } from "./types";
import { escapeHtml } from "./html-utils";

export function renderToolbar(model: WebviewAppModel, labels: TableEditorWebviewLabels): string {
  return `<header class="toolbar">
      <div class="title">${escapeHtml(labels.title)}</div>
      <div class="command-bar" aria-label="${escapeHtml(labels.editCommands)}">
        <button type="button" class="toolbar-button icon-button" data-action="undo-table-edit" aria-label="${escapeHtml(labels.undo)}" title="${escapeHtml(labels.undo)}">${codiconUndoIcon()}</button>
        <button type="button" class="toolbar-button icon-button" data-action="redo-table-edit" aria-label="${escapeHtml(labels.redo)}" title="${escapeHtml(labels.redo)}">${codiconRedoIcon()}</button>
        ${model.mode === "table-grid" ? `<div class="mode-toggle" role="group" aria-label="${escapeHtml(labels.tablePreview)}"><button type="button" data-action="set-editor-mode" data-editor-mode-value="edit" aria-label="${escapeHtml(labels.edit)}" title="${escapeHtml(labels.edit)}" aria-pressed="true">${codiconEditIcon()}</button><button type="button" data-action="set-editor-mode" data-editor-mode-value="preview" aria-label="${escapeHtml(labels.preview)}" title="${escapeHtml(labels.preview)}" aria-pressed="false">${codiconPreviewIcon()}</button></div><button type="button" class="toolbar-button icon-button" data-source-action="true" data-action="format-table" aria-label="${escapeHtml(labels.formatTable)}" title="${escapeHtml(labels.formatTable)}">${codiconFormatIcon()}</button><button type="button" class="toolbar-button icon-label-button" data-source-action="true" data-action="merge-cells" aria-label="${escapeHtml(labels.mergeSelectedCells)}" title="${escapeHtml(labels.mergeSelectedCells)}">${mergeCellsIcon()}<span>${escapeHtml(labels.merge)}</span></button><button type="button" class="toolbar-button icon-label-button" data-source-action="true" data-action="unmerge-cell" aria-label="${escapeHtml(labels.unmergeSelectedCell)}" title="${escapeHtml(labels.unmergeSelectedCell)}">${unmergeCellsIcon()}<span>${escapeHtml(labels.unmerge)}</span></button>` : ""}
      </div>
      <div class="status">${model.rowCount} ${escapeHtml(labels.rowsLabel)} / ${model.columnCount} ${escapeHtml(labels.columnsLabel)} / ${model.mode}</div>
    </header>`;
}

export function renderPreviewScreen(model: WebviewAppModel, labels: TableEditorWebviewLabels): string {
  if (model.mode !== "table-grid") {
    return "";
  }
  return `<section class="preview-screen" data-editor-view="preview" data-review-target="table-preview-screen" aria-label="${escapeHtml(labels.tablePreview)}" hidden><div class="preview-pane" data-review-target="table-preview" aria-label="${escapeHtml(labels.tablePreview)}">${model.preview.tableHtml}</div></section>`;
}
