import { codiconEditIcon, codiconFormatIcon, codiconPreviewIcon, codiconRedoIcon, codiconUndoIcon, mergeCellsIcon, unmergeCellsIcon } from "./icons";
import type { TableEditorWebviewLabels, WebviewAppModel } from "./types";
import { escapeHtml } from "./html-utils";

export function renderToolbar(model: WebviewAppModel, labels: TableEditorWebviewLabels): string {
  return `<header class="toolbar">
      <div class="title">${escapeHtml(labels.title)}</div>
      <div class="command-bar" aria-label="${escapeHtml(labels.editCommands)}">
        <div class="toolbar-group" role="group" aria-label="${escapeHtml(labels.undoRedo)}">
          <button type="button" class="toolbar-button icon-button" data-action="undo-table-edit" aria-label="${escapeHtml(labels.undo)}" title="${escapeHtml(labels.undo)}">${codiconUndoIcon()}</button>
          <button type="button" class="toolbar-button icon-button" data-action="redo-table-edit" aria-label="${escapeHtml(labels.redo)}" title="${escapeHtml(labels.redo)}">${codiconRedoIcon()}</button>
        </div>
        ${model.mode === "table-grid" ? `<div class="toolbar-group"><div class="mode-toggle" role="group" aria-label="${escapeHtml(labels.tablePreview)}"><button type="button" data-action="set-editor-mode" data-editor-mode-value="edit" aria-label="${escapeHtml(labels.edit)}" title="${escapeHtml(labels.edit)}" aria-pressed="true">${codiconEditIcon()}</button><button type="button" data-action="set-editor-mode" data-editor-mode-value="preview" aria-label="${escapeHtml(labels.preview)}" title="${escapeHtml(labels.preview)}" aria-pressed="false">${codiconPreviewIcon()}</button></div></div><div class="toolbar-group"><button type="button" class="toolbar-button icon-button" data-source-action="true" data-action="format-table" aria-label="${escapeHtml(labels.formatTable)}" title="${escapeHtml(labels.formatTable)}">${codiconFormatIcon()}</button></div><div class="toolbar-group style-toolbar" role="group" aria-label="${escapeHtml(labels.cellStyle)}"><button type="button" data-source-action="true" data-action="cell-align-left" aria-label="${escapeHtml(labels.alignLeft)}" title="${escapeHtml(labels.alignLeft)}">&lt;</button><button type="button" data-source-action="true" data-action="cell-align-center" aria-label="${escapeHtml(labels.alignCenter)}" title="${escapeHtml(labels.alignCenter)}">^</button><button type="button" data-source-action="true" data-action="cell-align-right" aria-label="${escapeHtml(labels.alignRight)}" title="${escapeHtml(labels.alignRight)}">&gt;</button><select data-source-action="true" data-action="cell-style-select" aria-label="${escapeHtml(labels.cellStyle)}"><option value="">${escapeHtml(labels.cellStyle)}</option><option value="m">m</option><option value="s">s</option><option value="e">e</option><option value="h">h</option><option value="l">l</option><option value="d">d</option></select></div><div class="toolbar-group" role="group" aria-label="${escapeHtml(labels.mergeOperation)}"><button type="button" class="toolbar-button icon-button" data-source-action="true" data-action="merge-cells" aria-label="${escapeHtml(labels.mergeSelectedCells)}" title="${escapeHtml(labels.mergeSelectedCells)}">${mergeCellsIcon()}</button><button type="button" class="toolbar-button icon-button" data-source-action="true" data-action="unmerge-cell" aria-label="${escapeHtml(labels.unmergeSelectedCell)}" title="${escapeHtml(labels.unmergeSelectedCell)}">${unmergeCellsIcon()}</button></div>` : ""}
      </div>
    </header>`;
}

export function renderPreviewScreen(model: WebviewAppModel, labels: TableEditorWebviewLabels): string {
  if (model.mode !== "table-grid") {
    return "";
  }
  return `<section class="preview-screen" data-editor-view="preview" data-review-target="table-preview-screen" aria-label="${escapeHtml(labels.tablePreview)}" hidden><div class="preview-pane" data-review-target="table-preview" aria-label="${escapeHtml(labels.tablePreview)}">${model.preview.tableHtml}</div></section>`;
}
