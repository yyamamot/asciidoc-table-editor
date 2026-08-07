import type { GridCell, TableDiagnostic } from "../core";
import type { TableEditorWebviewLabels, WebviewAppModel } from "./types";
import { escapeHtml, leadingWhitespace } from "./html-utils";

export function renderInspector(model: WebviewAppModel, labels: TableEditorWebviewLabels, selectedSourceCellId?: string): string {
  const cells = model.cells.flat().filter((cell): cell is GridCell => cell !== undefined);
  const first = cells.find((cell) => cell.sourceCellId === selectedSourceCellId) ?? cells[0];
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
    ${model.mode === "table-grid" ? renderTableSettings(model, first, labels) : ""}
    ${renderInspectorEditAction(model, first, labels)}
  </aside>`;
}

export function renderContextMenu(labels: TableEditorWebviewLabels): string {
  return `<div class="context-menu" data-context-menu="cell" data-review-target="cell-context-menu" role="menu" aria-label="${escapeHtml(labels.cellContextMenu)}" aria-hidden="true">
    <button type="button" role="menuitem" tabindex="-1" data-action="insert-row-before">${escapeHtml(labels.insertRowAbove)}</button>
    <button type="button" role="menuitem" tabindex="-1" data-action="insert-row-after">${escapeHtml(labels.insertRowBelow)}</button>
    <button type="button" role="menuitem" tabindex="-1" data-action="insert-column-before">${escapeHtml(labels.insertColumnLeft)}</button>
    <button type="button" role="menuitem" tabindex="-1" data-action="insert-column-after">${escapeHtml(labels.insertColumnRight)}</button>
    <div class="separator" role="separator"></div>
    <button type="button" role="menuitem" tabindex="-1" data-action="delete-row">${escapeHtml(labels.removeRow)}</button>
    <button type="button" role="menuitem" tabindex="-1" data-action="delete-column">${escapeHtml(labels.removeColumn)}</button>
    <div class="separator" role="separator"></div>
    <button type="button" role="menuitem" tabindex="-1" data-action="mark-header">${escapeHtml(labels.markHeader)}</button>
    <button type="button" role="menuitem" tabindex="-1" data-action="mark-noheader">${escapeHtml(labels.markNoHeader)}</button>
    <button type="button" role="menuitem" tabindex="-1" data-action="toggle-footer">${escapeHtml(labels.toggleFooter)}</button>
  </div>`;
}

function renderTableSettings(model: WebviewAppModel, cell: GridCell | undefined, labels: TableEditorWebviewLabels): string {
  const columnIndex = cell?.kind === "origin" ? cell.col : 0;
  const columnSpec = model.columns[columnIndex];
  const appearance = model.tableAppearance;
  return `<section class="table-settings" data-review-target="table-settings" aria-label="${escapeHtml(labels.tableSettings)}">
    <details>
      <summary>${escapeHtml(labels.columnSpec)}</summary>
      <div class="settings-grid">
        <label>${escapeHtml(labels.width)}<input data-table-setting="column-width" type="text" value="${escapeHtml(columnSpec?.widthRaw ?? "")}"></label>
        <label>${escapeHtml(labels.cellStyle)}<select data-table-setting="column-style">${renderOptions(["", "m", "s", "e", "h", "l", "d", "a"], columnSpec?.style)}</select></label>
        <button type="button" data-action="apply-column-spec">${escapeHtml(labels.applyColumnSpec)}</button>
      </div>
    </details>
    <details>
      <summary>${escapeHtml(labels.tableAppearance)}</summary>
      <div class="settings-grid">
        <label>${escapeHtml(labels.tableTitle)}<input data-table-setting="title" type="text" value="${escapeHtml(appearance.title ?? "")}"></label>
        <label>${escapeHtml(labels.tableId)}<input data-table-setting="id" type="text" value="${escapeHtml(appearance.id ?? "")}"></label>
        <label>${escapeHtml(labels.tableRole)}<input data-table-setting="role" type="text" value="${escapeHtml(appearance.role ?? "")}"></label>
        <label>${escapeHtml(labels.width)}<input data-table-setting="width" type="text" value="${escapeHtml(appearance.width ?? "")}"></label>
        <label>${escapeHtml(labels.frame)}<select data-table-setting="frame">${renderOptions(["", "topbot", "all", "none", "sides", "ends"], appearance.frame)}</select></label>
        <label>${escapeHtml(labels.grid)}<select data-table-setting="grid">${renderOptions(["", "all", "cols", "rows", "none"], appearance.grid)}</select></label>
        <label>${escapeHtml(labels.stripes)}<select data-table-setting="stripes">${renderOptions(["", "all", "even", "odd", "hover", "none"], appearance.stripes)}</select></label>
        <label class="checkbox-label"><input data-table-setting="autowidth" type="checkbox"${appearance.autowidth ? " checked" : ""}>${escapeHtml(labels.autowidth)}</label>
        <button type="button" data-action="apply-table-appearance">${escapeHtml(labels.applyTableAppearance)}</button>
      </div>
    </details>
  </section>`;
}

function renderOptions(values: readonly string[], selected: string | undefined): string {
  return values.map((value) => `<option value="${escapeHtml(value)}"${value === (selected ?? "") ? " selected" : ""}>${escapeHtml(value)}</option>`).join("");
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
        `<div class="diagnostic" data-severity="${diagnostic.severity}" data-diagnostic-code="${escapeHtml(diagnostic.code)}">${escapeHtml(diagnostic.code)}: ${escapeHtml(
          localizedDiagnosticMessage(diagnostic.code, labels)
        )}</div>`
    )
    .join("")}</footer>`;
}

function localizedDiagnosticMessage(code: string, labels: TableEditorWebviewLabels): string {
  return Object.prototype.hasOwnProperty.call(labels.diagnosticMessages, code)
    ? labels.diagnosticMessages[code] ?? labels.unknownDiagnosticMessage
    : labels.unknownDiagnosticMessage;
}
