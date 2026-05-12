import type { TableDiagnostic } from "../core";

export type CellContentUpdateResult =
  | { ok: true; diagnostics: TableDiagnostic[] }
  | { ok: false; diagnostics: TableDiagnostic[] };

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
  | { ok: true; diagnostics: TableDiagnostic[] }
  | { ok: false; diagnostics: TableDiagnostic[] };

export type SourceCellRevealResult =
  | { ok: true; diagnostics: TableDiagnostic[] }
  | { ok: false; diagnostics: TableDiagnostic[] };

export interface OpenTableEditorTarget {
  documentUri?: string;
  tableStartOffset?: number;
}

export type RowColumnEditMessage = {
  type:
    | "request-insert-row-before"
    | "request-insert-row-after"
    | "request-delete-row"
    | "request-insert-column-before"
    | "request-insert-column-after"
    | "request-delete-column";
  sourceCellId: string;
  selectedSourceCellId?: string;
};
