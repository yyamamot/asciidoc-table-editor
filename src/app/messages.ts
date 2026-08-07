import type { TableDiagnostic, TableFormatMode } from "../core";

export const TABLE_EDITOR_MESSAGE_QUOTAS = {
  maxRows: 256,
  maxColumns: 64,
  maxGridSlots: 4096,
  maxCells: 4096,
  maxMessageUtf8Bytes: 1024 * 1024,
  maxCellContentUtf8Bytes: 64 * 1024
} as const;

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

export type TableEditorMutationReason =
  | "new-edit"
  | "selection-change"
  | "tab"
  | "enter"
  | "blur"
  | "bottom-cell-editor"
  | "paste"
  | "clear";

export type TableEditorHostMessage = (
  | { type: "ui-review-snapshot"; snapshot: unknown }
  | { type: "update-cell-content"; sourceCellId: string; contentRaw: string; selectedSourceCellId?: string; reason?: TableEditorMutationReason }
  | { type: "update-cell-contents"; replacements: CellContentReplacement[]; selectedSourceCellId?: string; diagnostics?: RectangularPastePayload["diagnostics"]; reason?: TableEditorMutationReason }
  | ({ type: "paste-rectangular-table"; reason?: TableEditorMutationReason } & RectangularPastePayload)
  | ({ type: "paste-imported-table"; reason?: TableEditorMutationReason } & ImportedTablePastePayload)
  | { type: "update-block-cell-source"; sourceCellId: string; contentRaw: string; selectedSourceCellId?: string; reason?: TableEditorMutationReason }
  | { type: "replace-cell-with-block-source"; sourceCellId: string; contentRaw: string; selectedSourceCellId?: string; diagnostics?: RectangularPastePayload["diagnostics"]; reason?: TableEditorMutationReason }
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

export function isTableEditorMessageWithinByteQuota(message: unknown): boolean {
  return isJsonLikeValueWithinByteQuota(message, TABLE_EDITOR_MESSAGE_QUOTAS.maxMessageUtf8Bytes);
}

export function isUiReviewSnapshotMessage(message: unknown): message is Extract<TableEditorHostMessage, { type: "ui-review-snapshot" }> {
  return typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as { type?: unknown }).type === "ui-review-snapshot" &&
    "snapshot" in message &&
    hasOnlyKeys(message, ["type", "snapshot", "operationId", "revisionToken"]);
}

export function isUpdateCellContentMessage(message: unknown): message is Extract<TableEditorHostMessage, { type: "update-cell-content" }> {
  return typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as { type?: unknown }).type === "update-cell-content" &&
    nonEmptyString(message, "sourceCellId") &&
    typeof (message as { contentRaw?: unknown }).contentRaw === "string" &&
    cellContentWithinQuota((message as Record<string, unknown>).contentRaw as string) &&
    optionalString(message, "selectedSourceCellId") &&
    optionalMutationReason(message) &&
    hasOnlyKeys(message, ["type", "sourceCellId", "contentRaw", "selectedSourceCellId", "reason", "operationId", "revisionToken"]);
}

export function isUpdateCellContentsMessage(message: unknown): message is Extract<TableEditorHostMessage, { type: "update-cell-contents" }> {
  const replacements = (message as { replacements?: unknown } | undefined)?.replacements;
  return typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as { type?: unknown }).type === "update-cell-contents" &&
    Array.isArray(replacements) &&
    replacements.length > 0 &&
    replacements.length <= TABLE_EDITOR_MESSAGE_QUOTAS.maxCells &&
    uniqueNonEmptyStringProperty(replacements, "sourceCellId") &&
    replacements.every((replacement) =>
      typeof replacement === "object" &&
      replacement !== null &&
      nonEmptyString(replacement, "sourceCellId") &&
      typeof (replacement as { contentRaw?: unknown }).contentRaw === "string" &&
      cellContentWithinQuota((replacement as { contentRaw: string }).contentRaw) &&
      hasOnlyKeys(replacement, ["sourceCellId", "contentRaw"])
    ) &&
    optionalString(message, "selectedSourceCellId") &&
    optionalDiagnosticsAreValid(message) &&
    optionalMutationReason(message) &&
    hasOnlyKeys(message, ["type", "replacements", "selectedSourceCellId", "diagnostics", "reason", "operationId", "revisionToken"]);
}

export function isPasteRectangularTableMessage(message: unknown): message is Extract<TableEditorHostMessage, { type: "paste-rectangular-table" }> {
  const rows = (message as { rows?: unknown } | undefined)?.rows;
  return typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as { type?: unknown }).type === "paste-rectangular-table" &&
    nonEmptyString(message, "startSourceCellId") &&
    rectangularRowsAreValid(rows) &&
    optionalString(message, "selectedSourceCellId") &&
    optionalDiagnosticsAreValid(message) &&
    optionalMutationReason(message) &&
    hasOnlyKeys(message, ["type", "startSourceCellId", "rows", "selectedSourceCellId", "diagnostics", "reason", "operationId", "revisionToken"]);
}

export function isPasteImportedTableMessage(message: unknown): message is Extract<TableEditorHostMessage, { type: "paste-imported-table" }> {
  const cells = (message as { cells?: unknown } | undefined)?.cells;
  return typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as { type?: unknown }).type === "paste-imported-table" &&
    nonEmptyString(message, "startSourceCellId") &&
    importedGridIsValid((message as { rowCount?: unknown }).rowCount, (message as { columnCount?: unknown }).columnCount, cells) &&
    optionalString(message, "selectedSourceCellId") &&
    optionalDiagnosticsAreValid(message) &&
    optionalMutationReason(message) &&
    hasOnlyKeys(message, ["type", "startSourceCellId", "rowCount", "columnCount", "cells", "selectedSourceCellId", "diagnostics", "reason", "operationId", "revisionToken"]);
}

export function isUpdateBlockCellSourceMessage(message: unknown): message is Extract<TableEditorHostMessage, { type: "update-block-cell-source" }> {
  return typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as { type?: unknown }).type === "update-block-cell-source" &&
    nonEmptyString(message, "sourceCellId") &&
    typeof (message as { contentRaw?: unknown }).contentRaw === "string" &&
    cellContentWithinQuota((message as Record<string, unknown>).contentRaw as string) &&
    optionalString(message, "selectedSourceCellId") &&
    optionalMutationReason(message) &&
    hasOnlyKeys(message, ["type", "sourceCellId", "contentRaw", "selectedSourceCellId", "reason", "operationId", "revisionToken"]);
}

export function isReplaceCellWithBlockSourceMessage(message: unknown): message is Extract<TableEditorHostMessage, { type: "replace-cell-with-block-source" }> {
  return typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as { type?: unknown }).type === "replace-cell-with-block-source" &&
    nonEmptyString(message, "sourceCellId") &&
    typeof (message as { contentRaw?: unknown }).contentRaw === "string" &&
    cellContentWithinQuota((message as Record<string, unknown>).contentRaw as string) &&
    optionalString(message, "selectedSourceCellId") &&
    optionalDiagnosticsAreValid(message) &&
    optionalMutationReason(message) &&
    hasOnlyKeys(message, ["type", "sourceCellId", "contentRaw", "selectedSourceCellId", "diagnostics", "reason", "operationId", "revisionToken"]);
}

export function isMergeCellsMessage(message: unknown): message is Extract<TableEditorHostMessage, { type: "request-merge-cells" }> {
  const sourceCellIds = (message as { sourceCellIds?: unknown } | undefined)?.sourceCellIds;
  return typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as { type?: unknown }).type === "request-merge-cells" &&
    Array.isArray(sourceCellIds) &&
    sourceCellIds.length > 0 &&
    sourceCellIds.length <= TABLE_EDITOR_MESSAGE_QUOTAS.maxCells &&
    uniqueNonEmptyStrings(sourceCellIds) &&
    optionalString(message, "selectedSourceCellId") &&
    hasOnlyKeys(message, ["type", "sourceCellIds", "selectedSourceCellId", "operationId", "revisionToken"]);
}

export function isUnmergeCellMessage(message: unknown): message is Extract<TableEditorHostMessage, { type: "request-unmerge-cell" }> {
  return typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as { type?: unknown }).type === "request-unmerge-cell" &&
    nonEmptyString(message, "sourceCellId") &&
    optionalString(message, "selectedSourceCellId") &&
    hasOnlyKeys(message, ["type", "sourceCellId", "selectedSourceCellId", "operationId", "revisionToken"]);
}

export function isRevealSourceCellMessage(message: unknown): message is Extract<TableEditorHostMessage, { type: "request-reveal-source-cell" }> {
  return typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as { type?: unknown }).type === "request-reveal-source-cell" &&
    nonEmptyString(message, "sourceCellId") &&
    optionalString(message, "selectedSourceCellId") &&
    hasOnlyKeys(message, ["type", "sourceCellId", "selectedSourceCellId", "operationId", "revisionToken"]);
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
    nonEmptyString(message, "sourceCellId") &&
    optionalString(message, "selectedSourceCellId") &&
    hasOnlyKeys(message, ["type", "sourceCellId", "selectedSourceCellId", "operationId", "revisionToken"]);
}

export function isUndoRedoMessage(message: unknown): message is Extract<TableEditorHostMessage, { type: "request-undo" | "request-redo" }> {
  return typeof message === "object" &&
    message !== null &&
    "type" in message &&
    ((message as { type?: unknown }).type === "request-undo" || (message as { type?: unknown }).type === "request-redo") &&
    optionalString(message, "selectedSourceCellId") &&
    hasOnlyKeys(message, ["type", "selectedSourceCellId", "operationId", "revisionToken"]);
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
    optionalString(message, "selectedSourceCellId") &&
    hasOnlyKeys(message, ["type", "mode", "selectedSourceCellId", "operationId", "revisionToken"]);
}

export function isRequestFormatTableMessage(message: unknown): message is Extract<TableEditorHostMessage, { type: "request-format-table" }> {
  return typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as { type?: unknown }).type === "request-format-table" &&
    optionalString(message, "selectedSourceCellId") &&
    hasOnlyKeys(message, ["type", "selectedSourceCellId", "operationId", "revisionToken"]);
}

export function isUpdateCellStyleMessage(message: unknown): message is Extract<TableEditorHostMessage, { type: "request-update-cell-style" }> {
  const sourceCellIds = (message as { sourceCellIds?: unknown } | undefined)?.sourceCellIds;
  return typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as { type?: unknown }).type === "request-update-cell-style" &&
    Array.isArray(sourceCellIds) &&
    sourceCellIds.length > 0 &&
    sourceCellIds.length <= TABLE_EDITOR_MESSAGE_QUOTAS.maxCells &&
    uniqueNonEmptyStrings(sourceCellIds) &&
    optionalStyleValue(message) &&
    optionalHorizontalAlign(message) &&
    optionalVerticalAlign(message) &&
    optionalString(message, "selectedSourceCellId") &&
    hasOnlyKeys(message, ["type", "sourceCellIds", "style", "horizontalAlign", "verticalAlign", "selectedSourceCellId", "operationId", "revisionToken"]);
}

export function isUpdateHeaderFooterMessage(message: unknown): message is Extract<TableEditorHostMessage, { type: "request-update-header-footer" }> {
  return typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as { type?: unknown }).type === "request-update-header-footer" &&
    optionalBoolean(message, "header") &&
    optionalBoolean(message, "footer") &&
    optionalBoolean(message, "noheader") &&
    optionalString(message, "selectedSourceCellId") &&
    hasOnlyKeys(message, ["type", "header", "footer", "noheader", "selectedSourceCellId", "operationId", "revisionToken"]);
}

export function isUpdateColumnSpecMessage(message: unknown): message is Extract<TableEditorHostMessage, { type: "request-update-column-spec" }> {
  return typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as { type?: unknown }).type === "request-update-column-spec" &&
    isNonnegativeIntegerBelow((message as { columnIndex?: unknown }).columnIndex, TABLE_EDITOR_MESSAGE_QUOTAS.maxColumns) &&
    optionalString(message, "widthRaw") &&
    optionalStyleValue(message) &&
    optionalHorizontalAlign(message) &&
    optionalVerticalAlign(message) &&
    optionalString(message, "selectedSourceCellId") &&
    hasOnlyKeys(message, ["type", "columnIndex", "widthRaw", "horizontalAlign", "verticalAlign", "style", "selectedSourceCellId", "operationId", "revisionToken"]);
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
    optionalString(message, "selectedSourceCellId") &&
    hasOnlyKeys(message, ["type", "title", "id", "role", "width", "autowidth", "frame", "grid", "stripes", "selectedSourceCellId", "operationId", "revisionToken"]);
}

export function optionalDiagnosticsAreValid(message: unknown): boolean {
  if (typeof message !== "object" || message === null || !("diagnostics" in message)) {
    return true;
  }
  const diagnostics = (message as { diagnostics?: unknown }).diagnostics;
  if (!Array.isArray(diagnostics) || diagnostics.length > 1) return false;
  return diagnostics.length === 0 || (
    typeof diagnostics[0] === "object" &&
    diagnostics[0] !== null &&
    (diagnostics[0] as { code?: unknown }).code === "paste.rich-content-dropped" &&
    (diagnostics[0] as { severity?: unknown }).severity === "warning" &&
    typeof (diagnostics[0] as { message?: unknown }).message === "string" &&
    hasOnlyKeys(diagnostics[0], ["code", "severity", "message"])
  );
}

function optionalString(message: object, property: string): boolean {
  return !(property in message) || typeof (message as Record<string, unknown>)[property] === "string";
}

function hasOnlyKeys(message: object, allowedKeys: readonly string[]): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(message).every((key) => allowed.has(key));
}

function nonEmptyString(message: object, property: string): boolean {
  const value = (message as Record<string, unknown>)[property];
  return typeof value === "string" && value.length > 0;
}

function uniqueNonEmptyStrings(values: readonly unknown[]): boolean {
  const strings = values.filter((value): value is string => typeof value === "string" && value.length > 0);
  return strings.length === values.length && new Set(strings).size === values.length;
}

function uniqueNonEmptyStringProperty(values: readonly unknown[], property: string): boolean {
  const strings: string[] = [];
  for (const value of values) {
    if (typeof value !== "object" || value === null || !nonEmptyString(value, property)) return false;
    strings.push((value as Record<string, string>)[property]);
  }
  return new Set(strings).size === values.length;
}

function optionalBoolean(message: object, property: string): boolean {
  return !(property in message) || typeof (message as Record<string, unknown>)[property] === "boolean";
}

function optionalMutationReason(message: object): boolean {
  if (!("reason" in message)) return true;
  const reason = (message as { reason?: unknown }).reason;
  return reason === "new-edit" ||
    reason === "selection-change" ||
    reason === "tab" ||
    reason === "enter" ||
    reason === "blur" ||
    reason === "bottom-cell-editor" ||
    reason === "paste" ||
    reason === "clear";
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

function rectangularRowsAreValid(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0 || value.length > TABLE_EDITOR_MESSAGE_QUOTAS.maxRows) {
    return false;
  }
  const columnCount = Array.isArray(value[0]) ? value[0].length : 0;
  if (columnCount === 0 || columnCount > TABLE_EDITOR_MESSAGE_QUOTAS.maxColumns || value.length * columnCount > TABLE_EDITOR_MESSAGE_QUOTAS.maxGridSlots) {
    return false;
  }
  return value.every((row) =>
    Array.isArray(row) &&
    row.length === columnCount &&
    row.every((cell) => typeof cell === "string" && cellContentWithinQuota(cell))
  );
}

function importedGridIsValid(rowCountValue: unknown, columnCountValue: unknown, cellsValue: unknown): boolean {
  if (!isPositiveIntegerAtMost(rowCountValue, TABLE_EDITOR_MESSAGE_QUOTAS.maxRows) ||
      !isPositiveIntegerAtMost(columnCountValue, TABLE_EDITOR_MESSAGE_QUOTAS.maxColumns)) {
    return false;
  }
  const rowCount = rowCountValue;
  const columnCount = columnCountValue;
  const declaredSlots = rowCount * columnCount;
  if (declaredSlots > TABLE_EDITOR_MESSAGE_QUOTAS.maxGridSlots || !Array.isArray(cellsValue) || cellsValue.length > TABLE_EDITOR_MESSAGE_QUOTAS.maxGridSlots) {
    return false;
  }

  const occupied = new Set<number>();
  for (const value of cellsValue) {
    if (typeof value !== "object" || value === null) return false;
    const cell = value as { row?: unknown; col?: unknown; rowSpan?: unknown; colSpan?: unknown; text?: unknown };
    if (!isNonnegativeIntegerBelow(cell.row, rowCount) ||
        !isNonnegativeIntegerBelow(cell.col, columnCount) ||
        !isPositiveIntegerAtMost(cell.rowSpan, rowCount) ||
        !isPositiveIntegerAtMost(cell.colSpan, columnCount) ||
        typeof cell.text !== "string" ||
        !cellContentWithinQuota(cell.text)) {
      return false;
    }
    if (!hasOnlyKeys(value, ["row", "col", "rowSpan", "colSpan", "text"])) return false;
    const row = cell.row;
    const col = cell.col;
    const rowSpan = cell.rowSpan;
    const colSpan = cell.colSpan;
    if (row + rowSpan > rowCount || col + colSpan > columnCount) return false;
    for (let occupiedRow = row; occupiedRow < row + rowSpan; occupiedRow += 1) {
      for (let occupiedColumn = col; occupiedColumn < col + colSpan; occupiedColumn += 1) {
        const coordinate = occupiedRow * columnCount + occupiedColumn;
        if (occupied.has(coordinate)) return false;
        occupied.add(coordinate);
      }
    }
  }
  return occupied.size === declaredSlots;
}

function isPositiveIntegerAtMost(value: unknown, maximum: number): value is number {
  return Number.isInteger(value) && typeof value === "number" && value > 0 && value <= maximum;
}

function isNonnegativeIntegerBelow(value: unknown, upperBound: number): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= 0 && value < upperBound;
}

function isJsonLikeValueWithinByteQuota(value: unknown, maximumBytes: number): boolean {
  let bytes = 0;
  const ancestors = new WeakSet<object>();
  const add = (amount: number): boolean => {
    bytes += amount;
    return bytes <= maximumBytes;
  };
  const visitString = (text: string): boolean => {
    if (!add(2)) return false;
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      if (code === 0x22 || code === 0x5c || code === 0x08 || code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d) {
        if (!add(2)) return false;
      } else if (code < 0x20) {
        if (!add(6)) return false;
      } else if (code <= 0x7f) {
        if (!add(1)) return false;
      } else if (code <= 0x7ff) {
        if (!add(2)) return false;
      } else if (code >= 0xd800 && code <= 0xdbff) {
        const next = text.charCodeAt(index + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          index += 1;
          if (!add(4)) return false;
        } else if (!add(6)) {
          return false;
        }
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        if (!add(6)) return false;
      } else if (!add(3)) {
        return false;
      }
    }
    return true;
  };
  const visit = (current: unknown): boolean => {
    if (current === null) return add(4);
    if (typeof current === "string") return visitString(current);
    if (typeof current === "boolean") return add(current ? 4 : 5);
    if (typeof current === "number") {
      if (!Number.isFinite(current)) return false;
      return add(Object.is(current, -0) ? 1 : String(current).length);
    }
    if (typeof current !== "object") return false;
    if (ancestors.has(current)) return false;
    const prototype = Object.getPrototypeOf(current);
    if (!Array.isArray(current) && prototype !== Object.prototype && prototype !== null) return false;
    if (Object.getOwnPropertySymbols(current).length > 0) return false;
    ancestors.add(current);
    try {
      if (Array.isArray(current)) {
        if (!add(1)) return false;
        for (let index = 0; index < current.length; index += 1) {
          if (!Object.prototype.hasOwnProperty.call(current, index) || (index > 0 && !add(1)) || !visit(current[index])) return false;
        }
        return add(1);
      }
      const keys = Object.keys(current);
      if (!add(1)) return false;
      for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined) return false;
        if ((index > 0 && !add(1)) || !visitString(key) || !add(1) || !visit(descriptor.value)) return false;
      }
      return add(1);
    } finally {
      ancestors.delete(current);
    }
  };
  try {
    return visit(value);
  } catch {
    return false;
  }
}

function cellContentWithinQuota(value: string): boolean {
  return utf8Length(value, TABLE_EDITOR_MESSAGE_QUOTAS.maxCellContentUtf8Bytes) <= TABLE_EDITOR_MESSAGE_QUOTAS.maxCellContentUtf8Bytes;
}

function utf8Length(value: string, maximum = Number.POSITIVE_INFINITY): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 0x7f) {
      bytes += 1;
    } else if (codeUnit <= 0x7ff) {
      bytes += 2;
    } else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
    if (bytes > maximum) return bytes;
  }
  return bytes;
}
