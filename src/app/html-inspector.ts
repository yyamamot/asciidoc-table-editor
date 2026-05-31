import type { GridCell, TableDiagnostic } from "../core";
import type { TableEditorWebviewLabels, WebviewAppModel } from "./types";
import { escapeHtml, leadingWhitespace } from "./html-utils";

export function renderInspector(model: WebviewAppModel, labels: TableEditorWebviewLabels): string {
  const first = model.cells.flat().find((cell): cell is GridCell => cell !== undefined);
  const sourceCellId = first?.sourceCellId ?? "";
  const kind = first?.kind ?? "";
  const position = first ? `${labels.row} ${first.row + 1}, ${labels.column} ${first.col + 1}` : "";
  const span = first?.kind === "origin" ? `${first.rowSpan} x ${first.colSpan}` : "1 x 1";
  const readonly = `${labels.grid}: ${first?.kind === "origin" && first.editable ? labels.editable : labels.readonly}`;
  const content = first?.kind === "origin" ? first.contentRaw.trim() : first ? `${labels.coveredBy} ${first.coveredBy}` : "";

  return `<aside class="inspector" data-review-target="cell-inspector" aria-label="${escapeHtml(labels.selectedCell)}">
    <h2>${escapeHtml(labels.selectedCell)}</h2>
    <dl>
      <dt>${escapeHtml(labels.cell)}</dt><dd data-inspector-field="sourceCellId">${escapeHtml(sourceCellId)}</dd>
      <dt>${escapeHtml(labels.kind)}</dt><dd data-inspector-field="kind">${escapeHtml(kind)}</dd>
      <dt>${escapeHtml(labels.position)}</dt><dd data-inspector-field="position">${escapeHtml(position)}</dd>
      <dt>${escapeHtml(labels.span)}</dt><dd data-inspector-field="span">${escapeHtml(span)}</dd>
      <dt>${escapeHtml(labels.state)}</dt><dd data-inspector-field="readonly">${escapeHtml(readonly)}</dd>
      <dt>${escapeHtml(labels.content)}</dt><dd data-inspector-field="content">${escapeHtml(content)}</dd>
    </dl>
    ${model.mode === "table-grid" ? renderTableSettings(labels) : ""}
    ${renderInspectorEditAction(model, first, labels)}
  </aside>`;
}

export function renderContextMenu(labels: TableEditorWebviewLabels): string {
  return `<div class="context-menu" data-context-menu="cell" data-review-target="cell-context-menu" role="menu" aria-label="${escapeHtml(labels.cellContextMenu)}" aria-hidden="true">
    <button type="button" role="menuitem" data-action="insert-row-before">${escapeHtml(labels.insertRowAbove)}</button>
    <button type="button" role="menuitem" data-action="insert-row-after">${escapeHtml(labels.insertRowBelow)}</button>
    <button type="button" role="menuitem" data-action="insert-column-before">${escapeHtml(labels.insertColumnLeft)}</button>
    <button type="button" role="menuitem" data-action="insert-column-after">${escapeHtml(labels.insertColumnRight)}</button>
    <div class="separator" role="separator"></div>
    <button type="button" role="menuitem" data-action="delete-row">${escapeHtml(labels.removeRow)}</button>
    <button type="button" role="menuitem" data-action="delete-column">${escapeHtml(labels.removeColumn)}</button>
    <div class="separator" role="separator"></div>
    <button type="button" role="menuitem" data-action="mark-header">${escapeHtml(labels.markHeader)}</button>
    <button type="button" role="menuitem" data-action="mark-noheader">${escapeHtml(labels.markNoHeader)}</button>
    <button type="button" role="menuitem" data-action="toggle-footer">${escapeHtml(labels.toggleFooter)}</button>
  </div>`;
}

function renderTableSettings(labels: TableEditorWebviewLabels): string {
  return `<section class="table-settings" data-review-target="table-settings" aria-label="${escapeHtml(labels.tableSettings)}">
    <details>
      <summary>${escapeHtml(labels.columnSpec)}</summary>
      <div class="settings-grid">
        <label>${escapeHtml(labels.width)}<input data-table-setting="column-width" type="text"></label>
        <label>${escapeHtml(labels.cellStyle)}<select data-table-setting="column-style"><option value=""></option><option value="m">m</option><option value="s">s</option><option value="e">e</option><option value="h">h</option><option value="l">l</option><option value="d">d</option><option value="a">a</option></select></label>
        <button type="button" data-action="apply-column-spec">${escapeHtml(labels.applyColumnSpec)}</button>
      </div>
    </details>
    <details>
      <summary>${escapeHtml(labels.tableAppearance)}</summary>
      <div class="settings-grid">
        <label>${escapeHtml(labels.tableTitle)}<input data-table-setting="title" type="text"></label>
        <label>${escapeHtml(labels.tableId)}<input data-table-setting="id" type="text"></label>
        <label>${escapeHtml(labels.tableRole)}<input data-table-setting="role" type="text"></label>
        <label>${escapeHtml(labels.width)}<input data-table-setting="width" type="text"></label>
        <label>${escapeHtml(labels.frame)}<select data-table-setting="frame"><option value=""></option><option value="topbot">topbot</option><option value="all">all</option><option value="none">none</option><option value="sides">sides</option><option value="ends">ends</option></select></label>
        <label>${escapeHtml(labels.grid)}<select data-table-setting="grid"><option value=""></option><option value="all">all</option><option value="cols">cols</option><option value="rows">rows</option><option value="none">none</option></select></label>
        <label>${escapeHtml(labels.stripes)}<select data-table-setting="stripes"><option value=""></option><option value="all">all</option><option value="even">even</option><option value="odd">odd</option><option value="hover">hover</option><option value="none">none</option></select></label>
        <label class="checkbox-label"><input data-table-setting="autowidth" type="checkbox">${escapeHtml(labels.autowidth)}</label>
        <button type="button" data-action="apply-table-appearance">${escapeHtml(labels.applyTableAppearance)}</button>
      </div>
    </details>
  </section>`;
}

export function renderFallbackGuidance(model: WebviewAppModel, labels: TableEditorWebviewLabels): string {
  if (model.mode !== "fallback") {
    return "";
  }
  return `<section class="fallback-guidance" data-review-target="fallback-guidance" role="note" aria-label="${escapeHtml(labels.fallbackGuidanceTitle)}">
    <strong>${escapeHtml(labels.fallbackGuidanceTitle)}</strong>
    <span>${escapeHtml(labels.fallbackGuidanceBody)}</span>
    <button type="button" data-action="focus-diagnostics">${escapeHtml(labels.focusDiagnostics)}</button>
  </section>`;
}

export function renderBottomCellEditor(model: WebviewAppModel, labels: TableEditorWebviewLabels): string {
  const first = model.cells.flat().find((cell): cell is Extract<GridCell, { kind: "origin" }> => cell !== undefined && cell.kind === "origin");
  const leading = first ? leadingWhitespace(first.contentRaw) : "";
  const content = first ? first.contentRaw.slice(leading.length) : "";
  const plainEditable = Boolean(first?.editable && !first.blockContent);
  const blockEditable = Boolean(first?.blockContent);
  const editable = plainEditable || blockEditable;
  const position = first ? `${labels.row} ${first.row + 1}, ${labels.column} ${first.col + 1}` : "";
  const state = first ? `${first.rowSpan} x ${first.colSpan} / ${blockEditable ? labels.blockSource : plainEditable ? labels.editable : labels.readonly}` : labels.readonly;
  const editorLabel = blockEditable ? labels.blockSource : labels.editContent;
  const applyLabel = blockEditable ? labels.applyBlockSource : labels.applyCellContent;
  const action = blockEditable ? "update-block-cell-source" : "update-cell-content";

  return `<section class="cell-editor-bar" data-editor-view="edit" data-review-target="cell-editor-bar" aria-label="${escapeHtml(editorLabel)}">
    <div class="cell-editor-meta">
      <strong data-cell-editor-field="sourceCellId">${escapeHtml(first?.sourceCellId ?? "")}</strong>
      <span data-cell-editor-field="position">${escapeHtml(position)}</span>
      <span data-cell-editor-field="state">${escapeHtml(state)}</span>
    </div>
    <label>
      <span data-cell-editor-label="content">${escapeHtml(editorLabel)}</span>
      <textarea data-cell-editor-control="contentRaw" data-inspector-control="contentRaw" ${editable ? "" : "disabled"}>${escapeHtml(content)}</textarea>
    </label>
    <button type="button" data-cell-editor-action="apply" data-action="${action}" ${editable ? "" : "disabled"}>${escapeHtml(applyLabel)}</button>
  </section>`;
}
function renderInspectorEditAction(model: WebviewAppModel, cell: GridCell | undefined, labels: TableEditorWebviewLabels): string {
  if (model.mode !== "table-grid") {
    return "";
  }
  const blockContent = cell?.kind === "origin" && cell.blockContent;
  const blockPreviewHtml = cell?.kind === "origin" && cell.blockContent
    ? model.preview.blockCellHtmlBySourceCellId[cell.sourceCellId] ?? ""
    : "";
  return `<div data-inspector-action="edit-cell" hidden></div>
  <div data-inspector-action="edit-block-cell" ${blockContent ? "" : "hidden"}>
    <h3>${escapeHtml(labels.blockPreview)}</h3>
    <div class="block-preview-pane" data-inspector-block-preview>${blockPreviewHtml}</div>
  </div>`;
}
export function renderDiagnostics(diagnostics: TableDiagnostic[], labels: TableEditorWebviewLabels): string {
  if (diagnostics.length === 0) {
    return `<footer class="diagnostics" data-review-target="diagnostics" aria-live="polite" tabindex="-1"></footer>`;
  }

  return `<footer class="diagnostics" data-review-target="diagnostics" aria-live="polite" tabindex="-1">${diagnostics
    .map(
      (diagnostic) =>
        `<div class="diagnostic" data-severity="${diagnostic.severity}">${escapeHtml(diagnostic.code)}: ${escapeHtml(
          diagnostic.message
        )}</div>`
    )
    .join("")}</footer>`;
}
