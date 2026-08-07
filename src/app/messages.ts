import type { TableDiagnostic, TableFormatMode } from "../core";

export type CellContentUpdateResult =
  | { readonly ok: true; readonly diagnostics: TableDiagnostic[] }
  | { readonly ok: false; readonly diagnostics: TableDiagnostic[] };

export interface CellContentReplacement {
  readonly sourceCellId: string;
  readonly contentRaw: string;
}

export interface RectangularPastePayload {
  readonly startSourceCellId: string;
  readonly rows: readonly (readonly string[])[];
  readonly selectedSourceCellId?: string;
  readonly diagnostics?: readonly TableDiagnostic[];
}

export interface ImportedTablePastePayload {
  readonly startSourceCellId: string;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly cells: readonly {
    readonly row: number;
    readonly col: number;
    readonly rowSpan: number;
    readonly colSpan: number;
    readonly text: string;
  }[];
  readonly selectedSourceCellId?: string;
  readonly diagnostics?: readonly TableDiagnostic[];
}

export interface BlockCellContentReplacement {
  readonly sourceCellId: string;
  readonly contentRaw: string;
}

export interface PlainCellBlockReplacement {
  readonly sourceCellId: string;
  readonly contentRaw: string;
  readonly selectedSourceCellId?: string;
  readonly diagnostics?: readonly TableDiagnostic[];
}

export type UndoRedoResult =
  | { readonly ok: true; readonly diagnostics: TableDiagnostic[] }
  | { readonly ok: false; readonly diagnostics: TableDiagnostic[] };

export type SourceCellRevealResult =
  | { readonly ok: true; readonly diagnostics: TableDiagnostic[] }
  | { readonly ok: false; readonly diagnostics: TableDiagnostic[] };

export type RowColumnEditMessage = {
  readonly type:
    | "request-insert-row-before"
    | "request-insert-row-after"
    | "request-delete-row"
    | "request-insert-column-before"
    | "request-insert-column-after"
    | "request-delete-column";
  readonly sourceCellId: string;
  readonly selectedSourceCellId?: string;
};

export interface TableEditorOperationEnvelope {
  readonly operationId: string;
  readonly revisionToken: string;
}

export interface TableEditorResultMetadata {
  readonly operationId: string;
  readonly documentVersion: number;
  readonly revisionToken: string;
  readonly lastKnownRevisionToken?: string;
}

export type TableEditorHostMessage = (
  | { type: "ui-review-snapshot"; snapshot: unknown }
  | { type: "update-cell-content"; sourceCellId: string; contentRaw: string; selectedSourceCellId?: string }
  | { type: "update-cell-contents"; replacements: CellContentReplacement[]; selectedSourceCellId?: string; diagnostics?: RectangularPastePayload["diagnostics"] }
  | ({ type: "paste-rectangular-table" } & RectangularPastePayload)
  | ({ type: "paste-imported-table" } & ImportedTablePastePayload)
  | { type: "update-block-cell-source"; sourceCellId: string; contentRaw: string; selectedSourceCellId?: string }
  | { type: "replace-cell-with-block-source"; sourceCellId: string; contentRaw: string; selectedSourceCellId?: string; diagnostics?: RectangularPastePayload["diagnostics"] }
  | { type: "request-merge-cells"; sourceCellIds: string[]; selectedSourceCellId?: string }
  | { type: "request-unmerge-cell"; sourceCellId: string; selectedSourceCellId?: string }
  | RowColumnEditMessage
  | { type: "request-reveal-source-cell"; sourceCellId: string; selectedSourceCellId?: string }
  | { type: "request-undo" | "request-redo"; selectedSourceCellId?: string }
  | { type: "apply-format-table"; mode?: TableFormatMode; selectedSourceCellId?: string }
  | { type: "request-format-table"; selectedSourceCellId?: string }
  | { type: "request-update-cell-style"; sourceCellIds: string[]; style?: string; horizontalAlign?: "left" | "center" | "right"; verticalAlign?: "top" | "middle" | "bottom"; selectedSourceCellId?: string }
  | { type: "request-update-header-footer"; header?: boolean; footer?: boolean; noheader?: boolean; selectedSourceCellId?: string }
  | { type: "request-update-column-spec"; columnIndex: number; widthRaw?: string; horizontalAlign?: "left" | "center" | "right"; verticalAlign?: "top" | "middle" | "bottom"; style?: string; selectedSourceCellId?: string }
  | { type: "request-update-table-appearance"; title?: string; id?: string; role?: string; width?: string; autowidth?: boolean; frame?: string; grid?: string; stripes?: string; selectedSourceCellId?: string }
) & Partial<TableEditorOperationEnvelope>;

export type TableEditorResultMessage = (
  | { readonly type: "cell-content-update-result"; readonly result: CellContentUpdateResult }
  | { readonly type: "block-cell-update-result"; readonly result: CellContentUpdateResult }
  | { readonly type: "merge-cells-result"; readonly result: CellContentUpdateResult }
  | { readonly type: "unmerge-cell-result"; readonly result: CellContentUpdateResult }
  | { readonly type: "row-column-edit-result"; readonly result: CellContentUpdateResult }
  | { readonly type: "undo-redo-result"; readonly result: UndoRedoResult }
  | { readonly type: "source-cell-reveal-result"; readonly result: SourceCellRevealResult }
  | { readonly type: "format-table-result"; readonly result: CellContentUpdateResult }
  | { readonly type: "cell-style-update-result"; readonly result: CellContentUpdateResult }
  | { readonly type: "table-settings-update-result"; readonly result: CellContentUpdateResult }
) & Partial<TableEditorResultMetadata>;

export function hasTableEditorOperationEnvelope(message: unknown): message is TableEditorOperationEnvelope {
  return typeof message === "object" &&
    message !== null &&
    typeof (message as { operationId?: unknown }).operationId === "string" &&
    (message as { operationId: string }).operationId.length > 0 &&
    typeof (message as { revisionToken?: unknown }).revisionToken === "string" &&
    (message as { revisionToken: string }).revisionToken.length > 0;
}

export function isUiReviewSnapshotMessage(message: unknown): message is Extract<TableEditorHostMessage, { type: "ui-review-snapshot" }> {
  return typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as { type?: unknown }).type === "ui-review-snapshot" &&
    "snapshot" in message;
}

export function isUpdateCellContentMessage(message: unknown): message is Extract<TableEditorHostMessage, { type: "update-cell-content" }> {
  return typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as { type?: unknown }).type === "update-cell-content" &&
    typeof (message as { sourceCellId?: unknown }).sourceCellId === "string" &&
    typeof (message as { contentRaw?: unknown }).contentRaw === "string" &&
    optionalString(message, "selectedSourceCellId");
}

export function isUpdateCellContentsMessage(message: unknown): message is Extract<TableEditorHostMessage, { type: "update-cell-contents" }> {
  const replacements = (message as { replacements?: unknown } | undefined)?.replacements;
  return typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as { type?: unknown }).type === "update-cell-contents" &&
    Array.isArray(replacements) &&
    replacements.every((replacement) =>
      typeof replacement === "object" &&
      replacement !== null &&
      typeof (replacement as { sourceCellId?: unknown }).sourceCellId === "string" &&
      typeof (replacement as { contentRaw?: unknown }).contentRaw === "string"
    ) &&
    optionalString(message, "selectedSourceCellId") &&
    optionalDiagnosticsAreValid(message);
}

export function isPasteRectangularTableMessage(message: unknown): message is Extract<TableEditorHostMessage, { type: "paste-rectangular-table" }> {
  const rows = (message as { rows?: unknown } | undefined)?.rows;
  return typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as { type?: unknown }).type === "paste-rectangular-table" &&
    typeof (message as { startSourceCellId?: unknown }).startSourceCellId === "string" &&
    Array.isArray(rows) &&
    rows.every((row) => Array.isArray(row) && row.every((cell) => typeof cell === "string")) &&
    optionalString(message, "selectedSourceCellId") &&
    optionalDiagnosticsAreValid(message);
}

export function isPasteImportedTableMessage(message: unknown): message is Extract<TableEditorHostMessage, { type: "paste-imported-table" }> {
  const cells = (message as { cells?: unknown } | undefined)?.cells;
  return typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as { type?: unknown }).type === "paste-imported-table" &&
    typeof (message as { startSourceCellId?: unknown }).startSourceCellId === "string" &&
    typeof (message as { rowCount?: unknown }).rowCount === "number" &&
    typeof (message as { columnCount?: unknown }).columnCount === "number" &&
    Array.isArray(cells) &&
    cells.every((cell) =>
      typeof cell === "object" &&
      cell !== null &&
      typeof (cell as { row?: unknown }).row === "number" &&
      typeof (cell as { col?: unknown }).col === "number" &&
      typeof (cell as { rowSpan?: unknown }).rowSpan === "number" &&
      typeof (cell as { colSpan?: unknown }).colSpan === "number" &&
      typeof (cell as { text?: unknown }).text === "string"
    ) &&
    optionalString(message, "selectedSourceCellId") &&
    optionalDiagnosticsAreValid(message);
}

export function isUpdateBlockCellSourceMessage(message: unknown): message is Extract<TableEditorHostMessage, { type: "update-block-cell-source" }> {
  return typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as { type?: unknown }).type === "update-block-cell-source" &&
    typeof (message as { sourceCellId?: unknown }).sourceCellId === "string" &&
    typeof (message as { contentRaw?: unknown }).contentRaw === "string" &&
    optionalString(message, "selectedSourceCellId");
}

export function isReplaceCellWithBlockSourceMessage(message: unknown): message is Extract<TableEditorHostMessage, { type: "replace-cell-with-block-source" }> {
  return typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as { type?: unknown }).type === "replace-cell-with-block-source" &&
    typeof (message as { sourceCellId?: unknown }).sourceCellId === "string" &&
    typeof (message as { contentRaw?: unknown }).contentRaw === "string" &&
    optionalString(message, "selectedSourceCellId") &&
    optionalDiagnosticsAreValid(message);
}

export function isMergeCellsMessage(message: unknown): message is Extract<TableEditorHostMessage, { type: "request-merge-cells" }> {
  const sourceCellIds = (message as { sourceCellIds?: unknown } | undefined)?.sourceCellIds;
  return typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as { type?: unknown }).type === "request-merge-cells" &&
    Array.isArray(sourceCellIds) &&
    sourceCellIds.every((sourceCellId) => typeof sourceCellId === "string") &&
    optionalString(message, "selectedSourceCellId");
}

export function isUnmergeCellMessage(message: unknown): message is Extract<TableEditorHostMessage, { type: "request-unmerge-cell" }> {
  return typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as { type?: unknown }).type === "request-unmerge-cell" &&
    typeof (message as { sourceCellId?: unknown }).sourceCellId === "string" &&
    optionalString(message, "selectedSourceCellId");
}

export function isRevealSourceCellMessage(message: unknown): message is Extract<TableEditorHostMessage, { type: "request-reveal-source-cell" }> {
  return typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as { type?: unknown }).type === "request-reveal-source-cell" &&
    typeof (message as { sourceCellId?: unknown }).sourceCellId === "string" &&
    optionalString(message, "selectedSourceCellId");
}

export function isRowColumnEditMessage(message: unknown): message is RowColumnEditMessage {
  return typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (
      (message as { type?: unknown }).type === "request-insert-row-before" ||
      (message as { type?: unknown }).type === "request-insert-row-after" ||
      (message as { type?: unknown }).type === "request-delete-row" ||
      (message as { type?: unknown }).type === "request-insert-column-before" ||
      (message as { type?: unknown }).type === "request-insert-column-after" ||
      (message as { type?: unknown }).type === "request-delete-column"
    ) &&
    typeof (message as { sourceCellId?: unknown }).sourceCellId === "string" &&
    optionalString(message, "selectedSourceCellId");
}

export function isUndoRedoMessage(message: unknown): message is Extract<TableEditorHostMessage, { type: "request-undo" | "request-redo" }> {
  return typeof message === "object" &&
    message !== null &&
    "type" in message &&
    ((message as { type?: unknown }).type === "request-undo" || (message as { type?: unknown }).type === "request-redo") &&
    optionalString(message, "selectedSourceCellId");
}

export function isApplyFormatTableMessage(message: unknown): message is Extract<TableEditorHostMessage, { type: "apply-format-table" }> {
  return typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as { type?: unknown }).type === "apply-format-table" &&
    (
      !("mode" in message) ||
      (message as { mode?: unknown }).mode === "table-layout" ||
      (message as { mode?: unknown }).mode === "cell-per-line"
    ) &&
    optionalString(message, "selectedSourceCellId");
}

export function isRequestFormatTableMessage(message: unknown): message is Extract<TableEditorHostMessage, { type: "request-format-table" }> {
  return typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as { type?: unknown }).type === "request-format-table" &&
    optionalString(message, "selectedSourceCellId");
}

export function isUpdateCellStyleMessage(message: unknown): message is Extract<TableEditorHostMessage, { type: "request-update-cell-style" }> {
  const sourceCellIds = (message as { sourceCellIds?: unknown } | undefined)?.sourceCellIds;
  return typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as { type?: unknown }).type === "request-update-cell-style" &&
    Array.isArray(sourceCellIds) &&
    sourceCellIds.every((sourceCellId) => typeof sourceCellId === "string") &&
    optionalStyleValue(message) &&
    optionalHorizontalAlign(message) &&
    optionalVerticalAlign(message) &&
    optionalString(message, "selectedSourceCellId");
}

export function isUpdateHeaderFooterMessage(message: unknown): message is Extract<TableEditorHostMessage, { type: "request-update-header-footer" }> {
  return typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as { type?: unknown }).type === "request-update-header-footer" &&
    optionalBoolean(message, "header") &&
    optionalBoolean(message, "footer") &&
    optionalBoolean(message, "noheader") &&
    optionalString(message, "selectedSourceCellId");
}

export function isUpdateColumnSpecMessage(message: unknown): message is Extract<TableEditorHostMessage, { type: "request-update-column-spec" }> {
  return typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as { type?: unknown }).type === "request-update-column-spec" &&
    typeof (message as { columnIndex?: unknown }).columnIndex === "number" &&
    optionalString(message, "widthRaw") &&
    optionalStyleValue(message) &&
    optionalHorizontalAlign(message) &&
    optionalVerticalAlign(message) &&
    optionalString(message, "selectedSourceCellId");
}

export function isUpdateTableAppearanceMessage(message: unknown): message is Extract<TableEditorHostMessage, { type: "request-update-table-appearance" }> {
  return typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as { type?: unknown }).type === "request-update-table-appearance" &&
    optionalString(message, "title") &&
    optionalString(message, "id") &&
    optionalString(message, "role") &&
    optionalString(message, "width") &&
    optionalBoolean(message, "autowidth") &&
    optionalString(message, "frame") &&
    optionalString(message, "grid") &&
    optionalString(message, "stripes") &&
    optionalString(message, "selectedSourceCellId");
}

export function optionalDiagnosticsAreValid(message: unknown): boolean {
  if (typeof message !== "object" || message === null || !("diagnostics" in message)) {
    return true;
  }
  const diagnostics = (message as { diagnostics?: unknown }).diagnostics;
  return Array.isArray(diagnostics) &&
    diagnostics.every((diagnostic) =>
      typeof diagnostic === "object" &&
      diagnostic !== null &&
      typeof (diagnostic as { code?: unknown }).code === "string" &&
      (
        (diagnostic as { severity?: unknown }).severity === "info" ||
        (diagnostic as { severity?: unknown }).severity === "warning" ||
        (diagnostic as { severity?: unknown }).severity === "error"
      ) &&
      typeof (diagnostic as { message?: unknown }).message === "string"
    );
}

function optionalString(message: object, property: string): boolean {
  return !(property in message) || typeof (message as Record<string, unknown>)[property] === "string";
}

function optionalBoolean(message: object, property: string): boolean {
  return !(property in message) || typeof (message as Record<string, unknown>)[property] === "boolean";
}

function optionalStyleValue(message: object): boolean {
  return optionalString(message, "style");
}

function optionalHorizontalAlign(message: object): boolean {
  return !("horizontalAlign" in message) ||
    (message as { horizontalAlign?: unknown }).horizontalAlign === "left" ||
    (message as { horizontalAlign?: unknown }).horizontalAlign === "center" ||
    (message as { horizontalAlign?: unknown }).horizontalAlign === "right";
}

function optionalVerticalAlign(message: object): boolean {
  return !("verticalAlign" in message) ||
    (message as { verticalAlign?: unknown }).verticalAlign === "top" ||
    (message as { verticalAlign?: unknown }).verticalAlign === "middle" ||
    (message as { verticalAlign?: unknown }).verticalAlign === "bottom";
}
